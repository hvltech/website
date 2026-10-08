/* Builds the pixel map of Landkreis Havelland used in the homepage hero.
 *
 * Pulls the district boundary, rivers, canals, lakes, forests and town
 * positions from OpenStreetMap, plus driving routes between
 * the towns (OSRM on OpenStreetMap roads), rasterises the areas into a
 * grid of square "pixels" and writes ready-to-use SVG paths to
 * src/data/havelland-map.json.
 *
 *   npm run build-map            # uses cached OSM responses when present
 *   npm run build-map -- --refresh
 *
 * Map data © OpenStreetMap contributors, ODbL. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../src/data/havelland-map.json');
const CACHE_DIR = resolve(__dirname, '../node_modules/.cache/havelland-map');
const REFRESH = process.argv.includes('--refresh');
const USER_AGENT = 'hvltech.de map builder';

const DISTRICT_RELATION = 62413; // Landkreis Havelland
const BOUNDS = { lonMin: 12.06, lonMax: 13.3, latMin: 52.4, latMax: 52.84 };
const BBOX = `${BOUNDS.latMin},${BOUNDS.lonMin},${BOUNDS.latMax},${BOUNDS.lonMax}`;
const WIDTH = 700;
const CELL = 5;
const LON_FACTOR = Math.cos((((BOUNDS.latMin + BOUNDS.latMax) / 2) * Math.PI) / 180);
const SCALE = WIDTH / ((BOUNDS.lonMax - BOUNDS.lonMin) * LON_FACTOR);
const HEIGHT = Math.round((BOUNDS.latMax - BOUNDS.latMin) * SCALE);
const COLS = Math.ceil(WIDTH / CELL);
const ROWS = Math.ceil(HEIGHT / CELL);

const TOWNS: Record<string, string> = {
    Falkensee: 'falkensee',
    'Dallgow-Döberitz': 'dallgow',
    'Schönwalde-Glien': 'schoenwalde',
    Brieselang: 'brieselang',
    Wustermark: 'wustermark',
    Nauen: 'nauen',
    'Ketzin/Havel': 'ketzin',
    Premnitz: 'premnitz',
    Rathenow: 'rathenow',
};

const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
];

type LatLon = { lat: number; lon: number };
type Point = [number, number];
type Ring = Point[];
type OsmElement = {
    type: 'node' | 'way' | 'relation';
    lat?: number;
    lon?: number;
    tags?: Record<string, string>;
    geometry?: LatLon[];
    members?: { type: string; role: string; geometry?: LatLon[] }[];
};

async function cached<T>(name: string, load: () => Promise<T>): Promise<T> {
    const file = resolve(CACHE_DIR, `${name}.json`);
    if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf-8'));
    const data = await load();
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(data));
    return data;
}

async function overpass(query: string): Promise<OsmElement[]> {
    const body = new URLSearchParams({ data: `[out:json][timeout:240];(${query});out geom qt;` });
    for (const url of OVERPASS_MIRRORS) {
        try {
            const res = await fetch(url, { method: 'POST', body, headers: { 'User-Agent': USER_AGENT } });
            const text = await res.text();
            if (res.ok && text.startsWith('{')) return JSON.parse(text).elements;
            console.warn(`  ${url} answered ${res.status}, trying next mirror`);
        } catch (error) {
            console.warn(`  ${url} failed (${(error as Error).message}), trying next mirror`);
        }
    }
    throw new Error('All Overpass mirrors failed');
}

async function districtRings(): Promise<Ring[]> {
    const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=R${DISTRICT_RELATION}&format=json&polygon_geojson=1`;
    const [place] = await (await fetch(url, { headers: { 'User-Agent': USER_AGENT } })).json();
    const geo = place.geojson as { type: string; coordinates: number[][][] | number[][][][] };
    const polygons = (geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates) as number[][][][];
    return polygons.flat().map((ring) => ring.map(([lon, lat]) => project({ lat, lon })));
}

function project({ lat, lon }: LatLon): Point {
    return [(lon - BOUNDS.lonMin) * LON_FACTOR * SCALE, (BOUNDS.latMax - lat) * SCALE];
}

/** Joins the member ways of a multipolygon into closed rings. */
function assembleRings(ways: LatLon[][]): Ring[] {
    const key = (p: LatLon) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
    const open = ways.filter((w) => w.length > 1).map((w) => [...w]);
    const rings: Ring[] = [];
    while (open.length) {
        const ring = open.pop()!;
        let grew = true;
        while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
            grew = false;
            const end = key(ring[ring.length - 1]);
            const i = open.findIndex((w) => key(w[0]) === end || key(w[w.length - 1]) === end);
            if (i >= 0) {
                const [next] = open.splice(i, 1);
                if (key(next[0]) !== end) next.reverse();
                ring.push(...next.slice(1));
                grew = true;
            }
        }
        rings.push(ring.map(project));
    }
    return rings;
}

function featureRings(el: OsmElement): Ring[] {
    if (el.type === 'way' && el.geometry) return [el.geometry.map(project)];
    if (el.type === 'relation' && el.members) {
        return assembleRings(el.members.filter((m) => m.type === 'way' && m.geometry).map((m) => m.geometry!));
    }
    return [];
}

function ringArea(ring: Ring) {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    }
    return Math.abs(area / 2);
}

class Grid {
    cells = new Uint8Array(COLS * ROWS);
    get(col: number, row: number) {
        return col >= 0 && row >= 0 && col < COLS && row < ROWS ? this.cells[row * COLS + col] : 0;
    }
    set(col: number, row: number) {
        if (col >= 0 && row >= 0 && col < COLS && row < ROWS) this.cells[row * COLS + col] = 1;
    }

    /** Even-odd scanline fill at cell centres, so holes (islands) stay open. */
    fill(rings: Ring[]) {
        for (let row = 0; row < ROWS; row++) {
            const y = (row + 0.5) * CELL;
            const xs: number[] = [];
            for (const ring of rings) {
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                    const [x1, y1] = ring[j];
                    const [x2, y2] = ring[i];
                    if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
                }
            }
            xs.sort((a, b) => a - b);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                for (let col = Math.ceil(xs[k] / CELL - 0.5); (col + 0.5) * CELL <= xs[k + 1]; col++) {
                    this.set(col, row);
                }
            }
        }
    }

    /** Marks every cell a polyline passes through — a one-pixel-wide stroke. */
    stroke(line: Point[]) {
        for (let i = 1; i < line.length; i++) {
            const [x1, y1] = line[i - 1];
            const [x2, y2] = line[i];
            const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (CELL / 4)));
            for (let s = 0; s <= steps; s++) {
                this.set(Math.floor((x1 + ((x2 - x1) * s) / steps) / CELL), Math.floor((y1 + ((y2 - y1) * s) / steps) / CELL));
            }
        }
    }

    /** Horizontal runs of set cells as one compact SVG path. */
    toPath(where: (col: number, row: number) => boolean = (c, r) => this.get(c, r) === 1) {
        let d = '';
        for (let row = 0; row < ROWS; row++) {
            let start = -1;
            for (let col = 0; col <= COLS; col++) {
                const on = col < COLS && where(col, row);
                if (on && start < 0) start = col;
                if (!on && start >= 0) {
                    d += `M${start * CELL} ${row * CELL}h${(col - start) * CELL}v${CELL}h-${(col - start) * CELL}z`;
                    start = -1;
                }
            }
        }
        return d;
    }
}

/** Ramer–Douglas–Peucker, to keep the route lines small. */
function simplify(points: Point[], tolerance: number): Point[] {
    if (points.length < 3) return points;
    const [ax, ay] = points[0];
    const [bx, by] = points[points.length - 1];
    let index = 0;
    let max = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const [px, py] = points[i];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
        if (d > max) {
            max = d;
            index = i;
        }
    }
    if (max <= tolerance) return [points[0], points[points.length - 1]];
    return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

/** Driving route between two towns from the public OSRM demo server, which routes on OpenStreetMap roads. */
async function drivingRoute(from: LatLon, to: LatLon): Promise<LatLon[]> {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    if (data.code !== 'Ok') throw new Error(`OSRM: ${data.code} ${data.message ?? ''}`);
    // The demo server allows about one request per second.
    await new Promise((done) => setTimeout(done, 1100));
    return (data.routes[0].geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ lat, lon }));
}

async function main() {
    console.log('Fetching OpenStreetMap data…');
    const district = await cached('district', districtRings);
    const water = await cached('water', () =>
        overpass(`way["natural"="water"](${BBOX});relation["natural"="water"](${BBOX});`),
    );
    const waterways = await cached('waterways', () =>
        overpass(`way["waterway"~"^(river|canal)$"](${BBOX});`),
    );
    const places = await cached('places', () => overpass(`node["place"~"^(city|town|village)$"](${BBOX});`));
    let forest: OsmElement[] = [];
    try {
        forest = await cached('forest', () =>
            overpass(`way["landuse"="forest"](${BBOX});way["natural"="wood"](${BBOX});relation["landuse"="forest"](${BBOX});relation["natural"="wood"](${BBOX});`),
        );
    } catch (error) {
        console.warn(`Skipping forests: ${(error as Error).message}`);
    }

    console.log('Rasterising…');
    const land = new Grid();
    land.fill(district);

    const lakes = new Grid();
    for (const el of water) {
        const rings = featureRings(el);
        // Ponds under a few pixels just read as speckle at this scale.
        if (rings.reduce((sum, ring) => sum + ringArea(ring), 0) >= CELL * CELL * 3) lakes.fill(rings);
    }
    const rivers = new Grid();
    const canals = new Grid();
    for (const el of waterways) {
        if (!el.geometry) continue;
        const name = el.tags?.name ?? '';
        const line = el.geometry.map(project);
        if (el.tags?.waterway === 'river' && /^(Havel|Rhin|Dosse|Nuthe)$/.test(name)) rivers.stroke(line);
        if (el.tags?.waterway === 'canal' && /Havel|Hauptkanal/.test(name)) canals.stroke(line);
    }
    const woods = new Grid();
    for (const el of forest) woods.fill(featureRings(el));

    const isWater = (c: number, r: number) => lakes.get(c, r) === 1 || rivers.get(c, r) === 1;
    const inLand = (c: number, r: number) => land.get(c, r) === 1;

    const towns: Record<string, Point> = {};
    const townCoords: Record<string, LatLon> = {};
    for (const el of places) {
        const id = TOWNS[el.tags?.name ?? ''];
        if (id && el.lat !== undefined && el.lon !== undefined && !towns[id]) {
            townCoords[id] = { lat: el.lat, lon: el.lon };
            towns[id] = project({ lat: el.lat, lon: el.lon }).map((v) => Math.round(v * 10) / 10) as Point;
        }
    }
    const missing = Object.values(TOWNS).filter((id) => !towns[id]);
    if (missing.length) throw new Error(`Towns not found in OSM: ${missing.join(', ')}`);

    // Every pair of towns, so the tour can be reordered without rebuilding the map.
    // Keyed "a|b" with the ids sorted; the line runs from a to b.
    console.log('Routing between towns…');
    const ids = Object.values(TOWNS).sort();
    const roads: Record<string, { cells: string; line: string }> = {};
    for (const [i, a] of ids.entries()) {
        for (const b of ids.slice(i + 1)) {
            const route = await cached(`road-${a}-${b}`, () => drivingRoute(townCoords[a], townCoords[b]));
            const grid = new Grid();
            grid.stroke(route.map(project));
            const line = simplify(route.map(project), 1.5);
            roads[`${a}|${b}`] = {
                cells: grid.toPath(),
                line: `M${line.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`,
            };
        }
    }

    const output = {
        attribution: '© OpenStreetMap contributors (ODbL)',
        width: WIDTH,
        height: HEIGHT,
        cell: CELL,
        projection: { lonMin: BOUNDS.lonMin, latMax: BOUNDS.latMax, scale: SCALE, lonFactor: LON_FACTOR },
        paths: {
            border: land.toPath(
                (c, r) => !inLand(c, r) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => inLand(c + dc, r + dr)),
            ),
            land: land.toPath(),
            forest: woods.toPath((c, r) => inLand(c, r) && woods.get(c, r) === 1 && !isWater(c, r)),
            canal: canals.toPath((c, r) => canals.get(c, r) === 1 && !isWater(c, r)),
            water: lakes.toPath(isWater),
        },
        towns,
        roads,
    };
    writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
    console.log(`Wrote ${OUTPUT} (${Math.round(JSON.stringify(output).length / 1024)} KB)`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
