import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Program from "./program";
import BorderedBox from "./borderedBox";
import meetupData from "../data/meetup-events.json";
import { buildCalendarUrl, buildMapUrl, parseLocation, type MeetupEvent } from "../utils/eventLinks";

type CardProps = {
    datum: string;
    header: string;
    timeStr: string;
    venueName: string;
    address: string;
    contain: string;
    link?: string;
    internalLink?: string;
    isLast?: boolean;
    showProgram?: boolean;
    mapUrl?: string;
    calendarUrl?: string;
};

function useEventCards(events: MeetupEvent[]): CardProps[] {
    const { t, i18n } = useTranslation();
    const months = t('months', { returnObjects: true }) as string[];
    const lang = i18n.language;

    return events.map((event) => {
        const start = new Date(event.dateTime);
        const end = event.endTime ? new Date(event.endTime) : null;

        const day = start.getDate();
        const month = months[start.getMonth()] || '';

        const datum = lang === 'de'
            ? `${day}\n${month}`
            : `${month}\n${day}`;

        const { venueName, address } = parseLocation(event.location, event.title);

        let timeStr: string;
        if (end && end.getTime() !== start.getTime()) {
            const fromStr = formatTime(start, lang);
            const toStr = formatTime(end, lang);
            timeStr = t('event.fromTo', { from: fromStr, to: toStr });
        } else {
            const timeFormatted = formatTime(start, lang);
            const oclock = t('event.oclock');
            timeStr = `${t('event.at')} ${timeFormatted}${oclock ? ' ' + oclock : ''}`;
        }

        const isKidsLabs = /kids\s*labs/i.test(event.title);

        return {
            datum,
            header: event.title,
            timeStr,
            venueName,
            address,
            contain: event.description,
            link: isKidsLabs ? undefined : (event.eventUrl || undefined),
            internalLink: isKidsLabs ? '/labs' : undefined,
            mapUrl: event.mapUrl ?? buildMapUrl(venueName, address),
            calendarUrl: buildCalendarUrl(event, venueName, address),
        };
    });
}

function formatTime(date: Date, lang: string): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();

    if (lang === 'de') {
        return minutes === 0 ? `${hours}` : `${hours}:${String(minutes).padStart(2, '0')}`;
    }

    const period = hours >= 12 ? 'pm' : 'am';
    const h12 = hours % 12 || 12;
    return minutes === 0 ? `${h12}${period}` : `${h12}:${String(minutes).padStart(2, '0')}${period}`;
}

const PinIcon = ({ size = 16, color = "#15803d" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" className="flex-shrink-0">
        <rect x="6" y="1" width="4" height="2" fill={color} />
        <rect x="4" y="3" width="8" height="6" fill={color} />
        <rect x="6" y="5" width="4" height="2" fill="#fff" />
        <rect x="7" y="9" width="2" height="4" fill={color} />
    </svg>
);

const RssIcon = ({ size = 12, color = "#0d1b21" }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" shapeRendering="crispEdges">
        <rect x="1" y="9" width="3" height="3" fill={color} />
        <rect x="1" y="5" width="3" height="3" fill={color} /><rect x="5" y="9" width="3" height="3" fill={color} />
        <rect x="1" y="1" width="3" height="3" fill={color} /><rect x="5" y="5" width="3" height="3" fill={color} /><rect x="9" y="9" width="3" height="3" fill={color} />
    </svg>
);

const FeedGroup = () => (
    <div className="inline-flex border-[3px] border-black shadow-[3px_3px_0_#000]">
        <a
            href="/rss.xml"
            className="inline-flex items-center gap-1.5 px-3 py-2 no-underline font-['Press_Start_2P'] text-[8px] text-[#0d1b21] bg-amber-400 border-r-[3px] border-black hover:bg-green-700 hover:text-white active:translate-x-px active:translate-y-px"
        >
            <RssIcon />
            RSS
        </a>
        <a
            href="/events.ics"
            className="inline-flex items-center gap-1.5 px-3 py-2 no-underline font-['Press_Start_2P'] text-[8px] text-[#0d1b21] bg-white hover:bg-green-700 hover:text-white active:translate-x-px active:translate-y-px"
        >
            📅 iCAL
        </a>
    </div>
);

const actionBtn = "inline-flex items-center gap-1.5 no-underline bg-white text-[#0d1b21] border-[3px] border-black shadow-[3px_3px_0_#000] px-2.5 py-1.5 font-['Press_Start_2P'] text-[8px] hover:bg-amber-100 active:translate-x-px active:translate-y-px";

const Card = ({ datum, header, timeStr, venueName, address, contain, link, internalLink, showProgram, mapUrl, calendarUrl }: CardProps) => {
    const { t } = useTranslation();
    const isCafe = header.toLowerCase().includes('programmiercaf');
    const venueShortAddress = address.split(',')[0].trim();
    const hasActions = Boolean(venueName || mapUrl || calendarUrl);

    return (
        <div className="border-4 border-black shadow-[4px_4px_0px_#000] p-2 md:p-4 w-full flex flex-col items-center justify-center">
            <div className="w-full flex md:flex-row flex-col items-center md:items-start justify-between md:gap-6 gap-3 max-w-[1120px] bg-white">
                <BorderedBox>
                    <div
                        className={`
  md:w-35 md:h-35 w-40 h-40 image-pixelated
  text-white ${isCafe ? "bg-cyan-700" : "bg-green-700"}
  lg:text-4xl md:text-3xl text-4xl
  flex items-center justify-center text-center whitespace-pre-line
  font-['Press_Start_2P']
`}>
                        {datum}
                    </div>
                </BorderedBox>
                <div className='flex md:items-start items-center flex-col w-full px-4 md:px-6 gap-2'>
                    {internalLink ? (
                        <Link to={internalLink} className={`md:text-xl ${isCafe ? "text-cyan-700" : "text-green-700"} font-['Press_Start_2P'] self-center md:self-auto no-underline hover:underline`}>
                            <h3 className="m-0">{header}</h3>
                        </Link>
                    ) : link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer" className={`md:text-xl ${isCafe ? "text-cyan-700" : "text-green-700"} font-['Press_Start_2P'] self-center md:self-auto no-underline hover:underline`}>
                            <h3 className="m-0">{header}</h3>
                        </a>
                    ) : (
                        <h3 className={`md:text-xl ${isCafe ? "text-cyan-700" : "text-green-700"} font-['Press_Start_2P'] self-center md:self-auto m-0`}>{header}</h3>
                    )}
                    <p className="font-bold">{timeStr}</p>
                    {contain && <p className="italic text-gray-700 whitespace-pre-line">{contain}</p>}
                    {hasActions && (
                        <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1 w-full md:justify-start justify-center">
                            {venueName && (
                                <span className="inline-flex items-center gap-2 bg-amber-100 text-[#0d1b21] border-[3px] border-black shadow-[3px_3px_0_#000] px-2.5 py-1.5 text-[13px] leading-tight">
                                    <PinIcon size={16} color="#92400e" />
                                    <span>
                                        <strong className="text-[#00274a] font-bold">{venueName}</strong>
                                        {venueShortAddress && <span> · {venueShortAddress}</span>}
                                    </span>
                                </span>
                            )}
                            {mapUrl && (
                                <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={actionBtn}>
                                    🗺 {t('event.actions.map')}
                                </a>
                            )}
                            {calendarUrl && (
                                <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className={actionBtn}>
                                    📥 {t('event.actions.calendar')}
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {showProgram && <Program />}
        </div>
    );
}

const Event = () => {
    const { t } = useTranslation();
    const cardData = useEventCards(meetupData.upcomingEvents);

    return (
        <div
            className="bg-white gap-2.5 w-full px-2 md:px-8 py-4 md:py-8 flex flex-col items-center justify-around max-w-[1120px] mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4 mb-2">
                <h2 className="font-['Press_Start_2P'] font-normal text-base text-[#00274a] m-0">{t('event.nextEvent')}</h2>
                <FeedGroup />
            </div>
            {cardData.map((event: CardProps, index: number) => (
                <Card key={index} {...event} />
            ))}
        </div>
    );
};

export default Event;
