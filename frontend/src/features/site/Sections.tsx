import { Link } from "react-router-dom";
import {
  ArrowRight,
  AudioLines,
  BookHeart,
  CalendarClock,
  Check,
  Clock3,
  FileText,
  HeartHandshake,
  Images,
  MessageCircleHeart,
  ScanFace,
  ShieldCheck,
  Sparkles,
  UserX,
  UsersRound,
} from "lucide-react";
import { ProductPreview } from "./ProductPreview";
import { PUBLIC_DEMO } from "@/lib/publicDemo";
import { Brand, REPO_URL } from "./SiteNav";
import { Eyebrow, PillAnchor, Reveal, SectionIntro } from "./ui";


// ── Hero ─────────────────────────────────────────────────────────────
export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-heading" className="relative overflow-hidden">
      {/* soft decorative shapes */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-mint-100" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-plum-50/70" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-16 lg:pb-28 lg:pt-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-forest/15 bg-cream/80 px-4 py-1.5 text-sm font-medium text-forest">
            <Sparkles className="h-4 w-4 text-plum" aria-hidden="true" />
            Face recognition with a memory
          </p>
          <h1
            id="hero-heading"
            className="mt-6 font-display text-[2.85rem] font-normal leading-[1.04] tracking-[-0.02em] text-deep sm:text-6xl lg:text-[3.6rem] xl:text-[4.1rem]"
          >
            {/* Deliberate two-line break on wide screens; natural wrapping on phones. */}
            <span className="lg:block lg:whitespace-nowrap">Every familiar face </span>
            <span className="lg:block lg:whitespace-nowrap">
              holds a <em className="italic text-forest">beautiful story.</em>
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-moss sm:text-xl">
            Helping people reconnect with loved ones through intelligent facial recognition, meaningful conversations,
            and cherished memories.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <PillAnchor href="#demo" size="lg">
              Explore the demo
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </PillAnchor>
            <PillAnchor href="#how-it-works" tone="outline" size="lg">
              How it works
            </PillAnchor>
          </div>
          <ul className="mt-10 flex max-w-2xl flex-wrap gap-x-7 gap-y-3 text-[15px] text-moss">
            {["Runs on your own server", "Never guesses a name", "Read-aloud memories"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
          <div aria-hidden="true" className="absolute -inset-4 -rotate-2 rounded-[2.5rem] bg-forest/10" />
          <ProductPreview scenario="known" className="relative transition-transform duration-500 hover:-translate-y-1" />
        </div>
      </div>
    </section>
  );
}

// ── How it works ─────────────────────────────────────────────────────
const STEPS = [
  {
    n: "01",
    title: "Recognise",
    Icon: ScanFace,
    text: "A camera watches for visitors. The YuNet detector finds each face and SFace turns it into an identity signature that is compared with the people your family has enrolled.",
  },
  {
    n: "02",
    title: "Remember",
    Icon: BookHeart,
    text: "When someone is confidently recognised, their name, relationship and the last conversation you had together are retrieved — along with any family photos of them.",
  },
  {
    n: "03",
    title: "Reconnect",
    Icon: HeartHandshake,
    text: "The patient sees who is visiting in large, calm text and can listen to the last conversation, then explore familiar stories, photographs and relationships.",
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="bg-forest py-20 text-cream sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionIntro id="how-it-works" eyebrow="How it works" title="Three gentle steps, every time someone visits" light>
            From a face at the door to a familiar story — in about a second, without anyone needing to explain.
          </SectionIntro>
        </Reveal>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ n, title, Icon, text }, i) => (
            <li key={n}>
              <Reveal delay={i * 120} className="h-full">
                <article className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-forest-800/60 p-7 transition-colors duration-300 hover:bg-forest-800">
                  <div className="flex items-center justify-between">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cream text-forest">
                      <Icon className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <span className="font-display text-4xl text-mint-200" aria-hidden="true">
                      {n}
                    </span>
                  </div>
                  <h3 className="mt-8 font-display text-3xl text-cream">
                    <span className="sr-only">Step {i + 1}: </span>
                    {title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-mint-100">{text}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── Features ─────────────────────────────────────────────────────────
const AVAILABLE = [
  { Icon: ScanFace, title: "Real-time face recognition", text: "YuNet detection and SFace embeddings, matched by cosine similarity from a single frame — no dlib, no GPU required." },
  { Icon: UserX, title: "Unknown-person rejection", text: "Open-set matching with two thresholds: strangers are shown as unknown and possible matches as a question, never as a confident name." },
  { Icon: MessageCircleHeart, title: "Personalised memory recall", text: "The last conversation with each visitor, shown in large text and read aloud on request, with Stop always one tap away." },
  { Icon: AudioLines, title: "Conversation transcription", text: "Optional voice memos, recorded only after everyone agrees, transcribed with Whisper into a written memory.", note: "Requires Whisper on the server" },
  { Icon: FileText, title: "Optional AI summaries", text: "With an OpenAI key configured, long transcripts become one gentle sentence; without one, the transcript is kept as written.", note: "Off unless configured" },
  { Icon: UsersRound, title: "Caregiver management", text: "Add people, enroll faces by camera or upload — every rejected photo explained — and manage memories behind a password." },
  { Icon: CalendarClock, title: "Visit tracking", text: "Each continuous visit is logged once, with duration, a timeline, charts and CSV export for the care team." },
  { Icon: Images, title: "Family photo album", text: "Caregivers add photos with a story; the patient browses them by person or one at a time, with read-aloud." },
];

const PLANNED = [
  { Icon: Sparkles, title: "AI-suggested conversation prompts", text: "Gentle prompts generated for each family photo." },
  { Icon: UsersRound, title: "Several faces at once", text: "Recognising everyone in a group, not just the nearest visitor." },
  { Icon: Clock3, title: "Faster matching at scale", text: "A vector index (FAISS) for very large families and care homes." },
];

export function Features() {
  return (
    <section aria-labelledby="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionIntro id="features" eyebrow="Features" title={<>Built for safety first, <br className="hidden sm:block" />and warmth throughout</>}>
            Everything below is implemented in this project today. Ideas still on the roadmap are listed separately.
          </SectionIntro>
        </Reveal>
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AVAILABLE.map(({ Icon, title, text, note }, i) => (
            <li key={title}>
              <Reveal delay={(i % 4) * 80} className="h-full">
                <article className="group flex h-full flex-col rounded-[1.5rem] border border-forest/10 bg-cream p-6 shadow-soft transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-100 text-forest transition-colors group-hover:bg-forest group-hover:text-cream">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-deep">{title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-moss">{text}</p>
                  <p className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-mint-100 px-3 py-1 text-xs font-semibold text-forest">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {note ?? "Available now"}
                  </p>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>

        <Reveal className="mt-12">
          <div className="rounded-[1.75rem] border border-dashed border-plum/40 bg-plum-50/60 p-7 sm:p-9">
            <Eyebrow>On the roadmap · not built yet</Eyebrow>
            <ul className="mt-5 grid gap-6 md:grid-cols-3">
              {PLANNED.map(({ Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-plum-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-deep">{title}</h3>
                    <p className="mt-1 text-[15px] text-moss">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── About ────────────────────────────────────────────────────────────
export function About() {
  return (
    <section aria-labelledby="about" className="bg-cream py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20">
        <Reveal>
          <SectionIntro id="about" eyebrow="About" title="Why Memory Assistant exists">
            For someone living with memory difficulties, a familiar face that can't be placed can bring worry instead of
            joy — for them and for the visitor.
          </SectionIntro>
          <div className="mt-6 max-w-2xl space-y-4 text-lg leading-relaxed text-moss">
            <p>
              Memory Assistant quietly offers the missing context: who has arrived, how they're connected, and what you
              talked about last time. It's built around one rule — <strong className="font-semibold text-deep">a
              confidently wrong name is worse than no name</strong> — so it stays silent rather than guess.
            </p>
            <p>
              It began as a software engineering project and is open source. It's an assistive aid, not a medical device:
              it hasn't been clinically validated, and recognition accuracy depends on the camera, lighting and the photos
              used for enrollment.
            </p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="rounded-[1.75rem] border border-forest/10 bg-mint p-7 sm:p-9">
            <h3 className="font-display text-2xl text-deep">Under the hood</h3>
            <dl className="mt-6 space-y-5">
              {[
                ["Recognition", "OpenCV YuNet + SFace (ONNX), cosine-similarity matching with open-set rejection"],
                ["Backend", "Python, Flask, SQLite, a producer–consumer worker thread"],
                ["Frontend", "React, TypeScript, Tailwind CSS — tested with Vitest, Playwright and axe"],
                ["Privacy", "Self-hosted; video is analysed live and not recorded; photo location data is removed"],
              ].map(([k, v]) => (
                <div key={k} className="border-b border-forest/10 pb-5 last:border-0 last:pb-0">
                  <dt className="text-sm font-semibold uppercase tracking-wider text-forest">{k}</dt>
                  <dd className="mt-1 text-[15px] leading-relaxed text-deep">{v}</dd>
                </div>
              ))}
            </dl>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-7 inline-flex items-center gap-2 font-semibold text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest"
            >
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              Read the source on GitHub
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────
export function SiteFooter() {
  const col = "space-y-3 text-[15px]";
  const link = "text-mint-100 underline-offset-4 hover:text-white hover:underline";
  return (
    <footer className="bg-forest-800 text-cream">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <Brand light />
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-mint-100">
            Face recognition with a memory — helping people reconnect with the faces and stories they love.
          </p>
        </div>
        <nav aria-label="Homepage sections">
          <h2 className="font-body text-sm font-semibold uppercase tracking-wider text-mint-200">Explore</h2>
          <ul className={`mt-4 ${col}`}>
            <li><a className={link} href="#how-it-works">How it works</a></li>
            <li><a className={link} href="#features">Features</a></li>
            <li><a className={link} href="#demo">Try the demo</a></li>
            <li><a className={link} href="#about">About</a></li>
          </ul>
        </nav>
        <nav aria-label="Open the app">
          <h2 className="font-body text-sm font-semibold uppercase tracking-wider text-mint-200">Use it</h2>
          {PUBLIC_DEMO ? (
            <p className="mt-4 text-mint-200">
              This is the public demo: every scenario is simulated with fictional people. The patient screen and
              caregiver workspace run privately and are not part of this site.
            </p>
          ) : (
            <ul className={`mt-4 ${col}`}>
              <li><Link className={link} to="/">Patient screen</Link></li>
              <li><Link className={link} to="/caregiver/login">Caregiver login</Link></li>
            </ul>
          )}
        </nav>
        <div>
          <h2 className="font-body text-sm font-semibold uppercase tracking-wider text-mint-200">Project</h2>
          <ul className={`mt-4 ${col}`}>
            <li>
              <a className={link} href={REPO_URL} target="_blank" rel="noreferrer">
                Source code<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-5 py-6 text-sm text-mint-200 sm:px-8">
          An assistive prototype, not a medical device. Demo content on this page is fictional and simulated.
        </p>
      </div>
    </footer>
  );
}
