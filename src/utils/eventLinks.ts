import meetupData from '../data/meetup-events.json';

export interface MeetupEvent {
    title: string;
    dateTime: string;
    endTime: string;
    location: string;
    description: string;
    eventUrl: string;
    /** Google Maps link to the exact venue, when Meetup knows it. */
    mapUrl?: string;
}

const DEFAULT_VENUE_BY_TITLE: Record<string, string> = {
    'Programmiercafé': 'Kulturhaus „Johannes R. Becher" (Havelländer Weg 67, 14612 Falkensee)',
};

export function parseLocation(raw: string, title: string): { venueName: string; address: string } {
    const value = raw.trim().length > 0 ? raw : (DEFAULT_VENUE_BY_TITLE[title] || '');
    const match = value.match(/^([^(]+)\(([^)]+)\)/);
    if (match) return { venueName: match[1].trim(), address: match[2].trim() };
    return { venueName: value, address: '' };
}

export function buildMapUrl(venueName: string, address: string): string | undefined {
    const query = address || venueName;
    if (!query) return undefined;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function toCalendarStamp(date: Date): string {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

export function buildCalendarUrl(event: MeetupEvent, venueName: string, address: string): string | undefined {
    const start = new Date(event.dateTime);
    if (isNaN(start.getTime())) return undefined;
    const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const dates = `${toCalendarStamp(start)}/${toCalendarStamp(end)}`;
    const locationStr = [venueName, address].filter(Boolean).join(', ');
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: event.title,
        dates,
        location: locationStr,
        details: event.description + (event.eventUrl ? `\n\n${event.eventUrl}` : ''),
        ctz: 'Europe/Berlin',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** A single-event .ics file, for calendar apps that don't take a Google link. */
export function buildIcsUrl(event: MeetupEvent, location: string): string {
    const start = new Date(event.dateTime);
    const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const escape = (value: string) => value.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//HVLtech//hvltech.de//EN',
        'BEGIN:VEVENT',
        `UID:${event.eventUrl || event.dateTime}@hvltech.de`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
        `DTSTART;TZID=Europe/Berlin:${toCalendarStamp(start)}`,
        `DTEND;TZID=Europe/Berlin:${toCalendarStamp(end)}`,
        `SUMMARY:${escape(event.title)}`,
        `DESCRIPTION:${escape(`${event.description}\n\n${event.eventUrl}`)}`,
        location ? `LOCATION:${escape(location)}` : '',
        event.eventUrl ? `URL:${event.eventUrl}` : '',
        'END:VEVENT',
        'END:VCALENDAR',
    ].filter(Boolean);
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}

/** Meetup events that haven't ended yet, soonest first. */
export function upcomingEvents(): MeetupEvent[] {
    return (meetupData.upcomingEvents as MeetupEvent[]).filter(
        (event) => new Date(event.endTime || event.dateTime).getTime() > Date.now(),
    );
}
