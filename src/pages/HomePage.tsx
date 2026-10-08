import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import HavellandMap from "../component/HavellandMap";
import HavellandScene from "../component/HavellandScene";
import PhotoWall from "../component/PhotoWall";
import PixelArt, { type SpriteName } from "../component/PixelArt";
import SiteLayout, { EMAIL, FeedLinks, MEETUP_URL, PixelIcon } from "../component/site/SiteLayout";
import pearLogo from "../assets/logo/logo_no_text.svg";
import { HQ, findTown, tour, towns, type TownId } from "../data/havelland";
import { buildMailto } from "../utils/buildMailto";
import {
  buildCalendarUrl,
  buildIcsUrl,
  buildMapUrl,
  parseLocation,
  type MeetupEvent,
  upcomingEvents,
} from "../utils/eventLinks";
import { useSeo } from "../utils/useSeo";
import { useTheme } from "../utils/theme";
import "./home.css";

function eventTown(event?: MeetupEvent) {
  if (!event) return undefined;
  return findTown(event.location) ?? findTown(event.title) ?? findTown(event.description);
}

/** Tour stops are dinners. A talk night or Programmiercafé in Falkensee isn't a tour stop. */
const isDinner = (event: MeetupEvent) => /dinner/i.test(event.title);

/** "> Next up▌" typed out like a terminal prompt when the page opens. */
function TypedLabel({ text, motion }: { text: string; motion: boolean }) {
  const [typed, setTyped] = useState(motion ? 0 : text.length);

  useEffect(() => {
    if (!motion) {
      setTyped(text.length);
      return;
    }
    setTyped(0);
    let count = 0;
    let timer: number;
    const tick = () => {
      count += 1;
      setTyped(count);
      // Slightly uneven keystrokes read as a person typing, not a machine.
      if (count < text.length) timer = window.setTimeout(tick, 70 + ((count * 37) % 60));
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [text, motion]);

  return (
    <p className="next-label" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, typed)}</span>
      <span className={`cursor ${typed < text.length ? "is-typing" : ""}`} aria-hidden="true" />
    </p>
  );
}

/** "Add to calendar" dropdown. A plain <details>, plus closing on outside click and Escape. */
function CalendarMenu({ event, venueName, address, place }: { event: MeetupEvent; venueName: string; address: string; place: string }) {
  const { t } = useTranslation();
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      const el = menu.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) {
        el.open = false;
        if (e instanceof KeyboardEvent) el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details className="calendar-menu" ref={menu}>
      <summary>{t("home.next.addToCalendar")}</summary>
      <div>
        <a href={buildCalendarUrl(event, venueName, address)} target="_blank" rel="noopener noreferrer">
          {t("home.next.google")}
        </a>
        <a href={buildIcsUrl(event, place)} download="hvltech-event.ics">
          {t("home.next.ics")}
        </a>
        <a href="/events.ics">{t("home.next.subscribe")}</a>
      </div>
    </details>
  );
}

function NextEventCard({ event, lang, motion }: { event?: MeetupEvent; lang: string; motion: boolean }) {
  const { t } = useTranslation();
  if (!event) {
    return (
      <article className="next-card is-empty">
        <TypedLabel text={t("home.next.label")} motion={motion} />
        <p>{t("home.next.none")}</p>
        <a className="pixel-button" href={MEETUP_URL}>
          {t("home.next.follow")} <PixelIcon kind="arrow" />
        </a>
      </article>
    );
  }

  const start = new Date(event.dateTime);
  const end = event.endTime ? new Date(event.endTime) : undefined;
  const { venueName, address } = parseLocation(event.location, event.title);
  const town = eventTown(event);
  const place = [venueName, address].filter(Boolean).join(", ") || town?.name || "";
  const mapUrl = event.mapUrl ?? buildMapUrl(venueName, address);
  const time = (date: Date) =>
    new Intl.DateTimeFormat(lang === "de" ? "de" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);

  return (
    <article className="next-card" aria-labelledby="next-title">
      <TypedLabel text={t("home.next.label")} motion={motion} />
      <div className="next-body">
        <div className="next-date" aria-hidden="true">
          <span>{new Intl.DateTimeFormat(lang, { weekday: "short" }).format(start)}</span>
          <strong>{start.getDate()}</strong>
          <span>{new Intl.DateTimeFormat(lang, { month: "short" }).format(start)}</span>
        </div>
        <div>
          <h2 id="next-title">{event.title}</h2>
          <p className="next-meta">
            <span>
              <PixelIcon kind="clock" />
              <time dateTime={event.dateTime}>
                {new Intl.DateTimeFormat(lang, { day: "numeric", month: "long" }).format(start)},{" "}
                {time(start)}
                {end ? `–${time(end)}` : ""}
              </time>
            </span>
            {place && (
              <span>
                <PixelIcon kind="pin" />
                {mapUrl ? (
                  <a className="next-place" href={mapUrl} target="_blank" rel="noopener noreferrer">
                    {place}
                    <span className="sr-only"> ({t("home.next.openMap")})</span>
                  </a>
                ) : (
                  place
                )}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="next-actions">
        <a className="pixel-button" href={event.eventUrl || MEETUP_URL}>
          {t("home.next.rsvp")} <PixelIcon kind="arrow" />
        </a>
        <CalendarMenu event={event} venueName={venueName} address={address} place={place} />
      </div>
    </article>
  );
}

type AboutItem = { tag: string; title: string; text: string; cta?: string; secondary?: string };
type FaqItem = { icon: SpriteName; q: string; a: string; link?: string };

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === "de" ? "de" : "en";
  const [motion, setMotion] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const sceneScroller = useRef<HTMLDivElement>(null);

  const { hash } = useLocation();
  const theme = useTheme();
  const shortDate = (value: string) =>
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(value));
  const upcoming = upcomingEvents();
  const [next, ...later] = upcoming;
  const dinners = upcoming.filter(isDinner);
  const nextDinner = dinners[0];
  const nextTown = eventTown(nextDinner);
  // The first scheduled dinner in each town, so the tour can link straight to its Meetup page.
  const stopEvents = new Map<TownId, MeetupEvent>();
  for (const dinner of dinners) {
    const town = eventTown(dinner);
    if (town && !stopEvents.has(town.id)) stopEvents.set(town.id, dinner);
  }
  const stopLinks = Object.fromEntries(
    [...stopEvents].map(([town, event]) => [
      town,
      { href: event.eventUrl, label: `${event.title}, ${shortDate(event.dateTime)} (Meetup)` },
    ]),
  );
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
  const about = t("home.hero.about", { returnObjects: true }) as AboutItem[];
  const faqs = t("home.faq.items", { returnObjects: true }) as FaqItem[];
  const facts = t("home.community.facts", { returnObjects: true }) as string[];
  const kidsMail = buildMailto({
    to: EMAIL,
    subject: t("home.hero.kidsMailSubject"),
    body: t("home.hero.kidsMailBody"),
  });
  const inviteMail = buildMailto({
    to: EMAIL,
    subject: t("home.tour.inviteSubject"),
    body: t("home.tour.inviteBody"),
  });

  useSeo({ title: t("home.seoTitle"), description: t("home.seoDescription"), path: "/" });

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Header links from other pages land here as /#tour etc.; scroll to them.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  // On narrow screens the panorama scrolls sideways; start with HQ in view.
  useEffect(() => {
    const scroller = sceneScroller.current;
    if (scroller && scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollLeft = scroller.scrollWidth * (845 / 1200) - scroller.clientWidth / 2;
    }
  }, []);

  return (
    <SiteLayout
      className={`havel-home ${motion ? "" : "motion-paused"}`}
      skip={{ href: "#next", label: t("home.skip") }}
    >
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-intro">
          <p className="eyebrow">{t("home.hero.eyebrow")}</p>
          <h1 id="hero-title">{t("home.hero.title")}</h1>
          <p className="hero-lede">{t("home.hero.lede")}</p>
        </div>

        <div className="hero-events" id="next" tabIndex={-1}>
          <NextEventCard event={next} lang={lang} motion={motion} />
          {later.length > 0 && (
            <ul className="later-events">
              {later.map((event) => (
                <li key={event.eventUrl}>
                  <span>{shortDate(event.dateTime)}</span>
                  <a href={event.eventUrl}>{event.title}</a>
                </li>
              ))}
            </ul>
          )}
          <a className="text-link subtle all-events" href={MEETUP_URL}>
            {t("home.next.allEvents")} ↗
          </a>
          <FeedLinks />
        </div>

        <ul className="hero-about">
          {about.map((item, index) => {
            const kind = (["dinner", "talk", "kids"] as const)[index];
            return (
              <li key={item.title}>
                <PixelIcon kind={kind} />
                <div>
                  <p className="about-title">
                    <strong>{item.title}</strong>
                    <span className={`about-tag ${kind === "kids" ? "is-new" : ""}`}>{item.tag}</span>
                  </p>
                  <p>{item.text}</p>
                  {kind === "talk" && (
                    <Link className="text-link" to="/speakers">
                      {item.cta} →
                    </Link>
                  )}
                  {kind === "kids" && (
                    <span className="about-links">
                      <a className="text-link" href={kidsMail}>
                        {item.cta} ✉
                      </a>
                      <Link className="text-link subtle" to="/labs">
                        {item.secondary} →
                      </Link>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="scene-section" aria-label={t("home.scene.motto")}>
        <div className="scene-scroller" ref={sceneScroller}>
          <div className="scene-stage">
            <HavellandScene motion={motion} mascotLabel={t("home.hero.mascot")} night={theme === "dark"} />
          </div>
        </div>
        <p className="scene-hint" aria-hidden="true">
          ↔ {t("home.scene.hint")}
        </p>
        <div className="scene-footer">
          <p className="motto">{t("home.scene.motto")}</p>
          <button
            className="motion-toggle"
            onClick={() => setMotion(!motion)}
            aria-pressed={!motion}
            aria-label={motion ? t("home.scene.pause") : t("home.scene.play")}
            title={motion ? t("home.scene.pause") : t("home.scene.play")}
          >
            {motion ? "❚❚" : "▶"}
          </button>
        </div>
      </section>

      <section className="home-section tour-section" id="tour" aria-labelledby="tour-title">
        <div className="tour-head">
          <p className="eyebrow">{t("home.tour.eyebrow")}</p>
          <h2 id="tour-title">{t("home.tour.title")}</h2>
          <p>{t("home.tour.text")}</p>
        </div>
        <div className="tour-body">
          <div className="tour-map">
            <HavellandMap
              label={t("home.tour.mapLabel")}
              nextStop={nextTown?.id}
              legend={nextTown && nextDinner ? `${t("home.tour.legend")}: ${nextTown.name} · ${shortDate(nextDinner.dateTime)}` : undefined}
              links={stopLinks}
              hqLabel={t("home.tour.hq")}
              motion={motion}
            />
          </div>
          <ol className="tour-stops">
            {tour.map((stop, index) => {
              const town = towns.find((candidate) => candidate.id === stop.town)!;
              const isNext = stop.town === nextTown?.id;
              const isHq = stop.town === HQ;
              const event = stopEvents.get(stop.town);
              return (
                <li key={stop.town} className={`${isNext ? "is-next" : ""} ${isHq ? "is-hq" : ""}`}>
                  <span className="stop-number" aria-hidden="true">
                    {isHq ? <img src={pearLogo} alt="" /> : index + 1}
                  </span>
                  <span className="stop-month">
                    {event ? shortDate(event.dateTime) : monthLabel(stop.month)}
                  </span>
                  <strong>
                    {event ? (
                      <a href={event.eventUrl}>
                        {town.name}
                        <span className="sr-only"> ({t("home.tour.onMeetup")})</span>
                      </a>
                    ) : (
                      town.name
                    )}
                  </strong>
                  <span className="stop-fact">{t(`home.tour.facts.${stop.town}`)}</span>
                  <span className="stop-tag">
                    {isNext ? t("home.tour.next") : isHq ? t("home.tour.home") : t("home.tour.planned")}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <a className="text-link tour-invite" href={inviteMail}>
          {t("home.tour.invite")} ✉
        </a>
      </section>

      <section className="home-section community-section" id="community" aria-labelledby="community-title">
        <div className="community-head">
          <p className="eyebrow">{t("home.community.eyebrow")}</p>
          <h2 id="community-title">{t("home.community.title")}</h2>
          <p>{t("home.community.text")}</p>
          <ul className="fact-list">
            {facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
        <PhotoWall alt={t("home.community.photoAlt")} closeLabel={t("home.community.close")} />
      </section>

      <section className="home-section faq-section" id="faq" aria-labelledby="faq-title">
        <p className="eyebrow">{t("home.faq.eyebrow")}</p>
        <h2 id="faq-title">{t("home.faq.title")}</h2>
        <div className="faq-grid">
          {faqs.map((item) => (
            <article key={item.q} className="faq-card">
              <PixelArt name={item.icon} className="faq-art" />
              <h3>{item.q}</h3>
              <p>{item.a}</p>
              {item.link && (
                <Link className="text-link" to={item.icon === "kids" ? "/labs" : "/speakers"}>
                  {item.link} →
                </Link>
              )}
            </article>
          ))}
        </div>
        <p className="faq-more">
          <a className="text-link" href={`mailto:${EMAIL}`}>
            {EMAIL} ↗
          </a>
        </p>
      </section>

    </SiteLayout>
  );
}
