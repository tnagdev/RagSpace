import { Link } from '@tanstack/react-router';
import { Linkedin, ExternalLink, ArrowLeft } from 'lucide-react';
import logoImg from '@/assets/logo-filorag-bordered.png';
import avatarImg from '@/assets/founder-avatar.png';

// ─── Navbar ─────────────────────────────────────────────────────────────────────
const Navbar = () => (
  <header
    className="fixed top-0 left-0 right-0 z-50"
    style={{
      background: 'rgba(10, 10, 31, 0.85)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(168, 85, 247, 0.1)',
    }}
  >
    <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <Link to="/" style={{ textDecoration: 'none' }}>
        <img src={logoImg} alt="FiloRag" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
      </Link>
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-200"
        style={{ color: 'rgba(203, 213, 225, 0.7)', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#a855f7')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(203, 213, 225, 0.7)')}
      >
        <ArrowLeft size={15} />
        Back to Home
      </Link>
    </div>
  </header>
);

// ─── Divider ────────────────────────────────────────────────────────────────────
const Divider = () => (
  <div className="w-10 h-0.5 rounded-full" style={{ background: 'linear-gradient(to right, #a855f7, #ec4899)' }} />
);

// ─── Quote block ────────────────────────────────────────────────────────────────
const Quote = ({ children }: { children: React.ReactNode }) => (
  <blockquote
    className="pl-5 py-1 text-base italic leading-relaxed"
    style={{ borderLeft: '3px solid rgba(168, 85, 247, 0.5)', color: 'rgba(196, 181, 253, 0.9)' }}
  >
    {children}
  </blockquote>
);

// ─── About Page ──────────────────────────────────────────────────────────────────
const AboutPage = () => (
  <div
    style={{
      fontFamily: '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a1f 0%, #1a1a3e 50%, #0f0f2e 100%)',
      color: '#f8fafc',
    }}
  >
    <Navbar />

    {/* Bg orbs */}
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <div className="absolute top-0 left-0 w-150 h-150 rounded-full blur-3xl animate-pulse"
        style={{ background: '#a855f7', opacity: 0.09, animationDuration: '9s' }} />
      <div className="absolute bottom-0 right-0 w-125 h-125 rounded-full blur-3xl animate-pulse"
        style={{ background: '#ec4899', opacity: 0.07, animationDuration: '11s', animationDelay: '3s' }} />
    </div>

    <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-24">
      <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-16 xl:gap-24">

        {/* ── Sidebar (sticky on desktop, stacked on mobile) ── */}
        <aside className="mb-12 lg:mb-0">
          <div className="lg:sticky lg:top-28 flex flex-col gap-6">

            {/* Photo */}
            <div className="relative w-fit">
              <div
                className="w-48 h-48 lg:w-full lg:h-auto rounded-3xl overflow-hidden"
                style={{
                  aspectRatio: '1 / 1.1',
                  boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.2), 0 20px 60px rgba(0,0,0,0.5)',
                }}
              >
                <img
                  src={avatarImg}
                  alt="Tridibesh Nag"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              {/* Purple glow under photo */}
              <div
                className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-10 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse, rgba(168,85,247,0.35) 0%, transparent 70%)', filter: 'blur(12px)' }}
              />
            </div>

            {/* Identity */}
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-bold" style={{ lineHeight: 1.2 }}>Tridibesh Nag</h1>
              <p className="text-sm" style={{ color: 'rgba(148, 163, 184, 0.6)' }}>
                Hobbyist builder. Full-stack dev.<br />Creator of FiloRag.
              </p>
              <a
                href="https://www.linkedin.com/in/tridibesh-nag-b9381b16a/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium w-fit px-3 py-1.5 rounded-lg transition-all duration-200"
                style={{
                  background: 'rgba(168, 85, 247, 0.1)',
                  border: '1px solid rgba(168, 85, 247, 0.2)',
                  color: '#c084fc',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(168, 85, 247, 0.18)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.4)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(168, 85, 247, 0.1)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.2)';
                }}
              >
                <Linkedin size={12} />
                LinkedIn
                <ExternalLink size={10} style={{ opacity: 0.55 }} />
              </a>
            </div>

            {/* Divider line on desktop */}
            <div className="hidden lg:block h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

            {/* Quick context block */}
            <div className="hidden lg:flex flex-col gap-3">
              {[
                { label: 'Based in', value: 'India' },
                { label: 'Day job', value: 'Software developer' },
                { label: 'Building', value: 'FiloRag — side project' },
                { label: 'Interests', value: 'AI, video, making things' },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-xs uppercase tracking-wider" style={{ color: 'rgba(148, 163, 184, 0.35)' }}>{label}</span>
                  <span className="text-sm" style={{ color: 'rgba(226, 232, 240, 0.8)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main story ── */}
        <main className="flex flex-col gap-14">

          {/* ── Hey, it's me ── */}
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">Hey — a bit about me</h2>
              <Divider />
            </div>
            <div className="flex flex-col gap-4 text-base leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.85)' }}>
              <p>
                Okay so I'm not really a "startup founder" in the traditional sense. I'm just a developer
                who likes building things. I have a day job, I write code for fun on weekends, and occasionally
                one of those weekend projects turns into something I actually want to finish.
              </p>
              <p>
                FiloRag is one of those projects. It started messy, got rebuilt a few times, and honestly
                still has rough edges — but it works, and I use it myself, which is more than I can say
                for most side projects I start.
              </p>
              <p>
                I've been doing full-stack development for a few years now. I like the whole stack —
                frontend UX, backend architecture, infrastructure stuff. The AI tooling wave has been genuinely
                exciting to me because it's changing what a single person can ship. That got me curious.
                So I started exploring.
              </p>
            </div>
          </section>

          {/* ── The real story ── */}
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">How FiloRag actually happened</h2>
              <Divider />
            </div>
            <div className="flex flex-col gap-4 text-base leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.85)' }}>
              <p>
                I was doing an online course — one of those long video series where each video is like 45
                minutes. I remembered watching an explanation of something weeks earlier and wanting to go
                back to it. But which video? Which timestamp? I had no idea.
              </p>
              <p>
                I ended up just rewatching three videos partially before I found it. That felt so dumb.
                I thought there must be something that lets you search video content properly.
              </p>
              <Quote>
                Turns out there wasn't. Not really. Not the way I wanted.
              </Quote>
              <p>
                Most things give you a transcript dump. Some give you a summary. What I wanted was to
                literally just say "that part where he explained why transformers work" and get sent
                to the right timestamp. That was it. That was the whole idea.
              </p>
              <p>
                I started building it not because I thought it'd be a business, but because I wanted
                it to exist. I still feel that way.
              </p>
            </div>
          </section>

          {/* ── Who it's for ── */}
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">Who I built this for</h2>
              <Divider />
            </div>
            <div className="flex flex-col gap-3">
              {[
                {
                  label: 'People doing online courses',
                  text: "If you've ever paused a video, zoomed out to find a better explanation online, and then completely lost your place — you'll get it immediately.",
                },
                {
                  label: 'Anyone with a backlog of "saved for later"',
                  text: "We all have that pile. Talks, lectures, interviews we saved and never got back to. FiloRag makes them actually useful.",
                },
                {
                  label: 'Researchers and writers',
                  text: "When you're deep in a topic, being able to ask across all your reference material at once is genuinely different from searching one document at a time.",
                },
                {
                  label: 'Honestly, past me',
                  text: "I built this for the version of me that spent 40 minutes scrubbing through a video looking for one moment. That person needed this.",
                },
              ].map(({ label, text }) => (
                <div
                  key={label}
                  className="rounded-2xl p-5 flex flex-col gap-2"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <span className="text-sm font-semibold" style={{ color: '#c084fc' }}>{label}</span>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.75)' }}>{text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Honest thoughts ── */}
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">Some honest thoughts on the product</h2>
              <Divider />
            </div>
            <div className="flex flex-col gap-4 text-base leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.85)' }}>
              <p>
                I'm not going to pretend FiloRag is perfect. It's a side project built in spare hours.
                Some things are polished. Some are held together with duct tape. I'm aware.
              </p>
              <p>
                What I do care about a lot is that the core thing — the search, the chat, finding the right
                moment — actually works. If that doesn't work, nothing else matters. So that's where most
                of the care went.
              </p>
              <p>
                I also am deeply allergic to bloated UIs. I've used too many tools that bury what you
                actually want under layers of menus and panels. I try really hard to avoid that.
                Whether I've succeeded... use it and tell me.
              </p>
              <p>
                People often ask about PDFs, text files, Word docs. Yes, I know. Yes, I've thought about it.
                Honestly though — that space is already crowded. Half the AI tools out there do "chat with
                your PDF." I didn't want to build the fifteenth version of that. Videos felt underserved,
                so I started there. The other formats will come, just not as the main act.
              </p>
            </div>
          </section>

          {/* ── What's next card ── */}
          <section
            className="rounded-3xl p-7 flex flex-col gap-6"
            style={{
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(236, 72, 153, 0.04))',
              border: '1px solid rgba(168, 85, 247, 0.18)',
            }}
          >
            <h2 className="text-xl font-bold">What's rattling around in my head</h2>
            <div className="flex flex-col gap-4 text-base leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.85)' }}>
              <p>
                There's a bunch of stuff I keep thinking about adding. Not promises — just ideas I can't
                stop coming back to:
              </p>
              <div className="flex flex-col gap-3">
                {[
                  {
                    title: 'PDF, text & office files',
                    desc: "Yes, eventually. But deliberately not the priority — too many tools already do this. I'll get there once the video side feels solid.",
                  },
                  {
                    title: 'Collection chats',
                    desc: "Instead of chatting with one file at a time, being able to ask across an entire collection — like 'what do all these lecture recordings say about topic X?' That one I really want.",
                  },
                  {
                    title: 'Sharing and shared drives',
                    desc: "The ability to share a collection or a curated knowledge base with someone else, manage access, collaborate on a shared library. Feels like a natural next step for teams.",
                  },
                  {
                    title: 'Content and report generation',
                    desc: "Using your files as source material to generate summaries, study notes, reports — not just question-answering but actual output creation. This one excites me a lot.",
                  },
                ].map(({ title, desc }) => (
                  <div
                    key={title}
                    className="rounded-xl p-4 flex flex-col gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-sm font-semibold" style={{ color: '#c084fc' }}>{title}</span>
                    <p className="text-sm leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.72)' }}>{desc}</p>
                  </div>
                ))}
              </div>
              <p>
                Will keep building. No promises on timelines — this is a hobby, it ships when it's ready.
                But the list keeps growing, which I take as a good sign.
              </p>
            </div>
            <p className="text-sm" style={{ color: 'rgba(168, 85, 247, 0.6)' }}>
              — Tridibesh
            </p>
          </section>

          {/* ── Reach out ── */}
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">Let's talk</h2>
              <Divider />
            </div>
            <div className="flex flex-col gap-4 text-base leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.85)' }}>
              <p>
                If you want to contribute, have a crazy idea you'd love to see in here, spotted a bug
                that's driving you mad, or just want to say the thing works — I genuinely want to hear it.
                Appreciation included, that stuff keeps the nights going.
              </p>
              <p>
                You can reach me at{' '}
                <a
                  href="mailto:tnag97@gmail.com"
                  style={{ color: '#c084fc', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e879f9')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#c084fc')}
                >
                  tnag97@gmail.com
                </a>
                {' '}or just drop a message on LinkedIn. Both work. Both are read.
              </p>
            </div>
          </section>

          {/* ── CTA ── */}
          <section className="flex flex-col gap-5 pt-2">
            <p className="text-base" style={{ color: 'rgba(148, 163, 184, 0.6)' }}>
              If any of this resonated — just try it. It's free to get started.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/auth/signup"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-sm transition-all duration-300"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                  textDecoration: 'none',
                  boxShadow: '0 0 28px rgba(168, 85, 247, 0.3)',
                }}
              >
                Start for free
              </Link>
              <a
                href="mailto:tnag97@gmail.com"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  background: 'rgba(168, 85, 247, 0.07)',
                  border: '1px solid rgba(168, 85, 247, 0.18)',
                  color: 'rgba(196, 181, 253, 0.85)',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(168, 85, 247, 0.14)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.38)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(168, 85, 247, 0.07)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.18)';
                }}
              >
                ✉ Drop me a mail
              </a>
              <a
                href="https://www.linkedin.com/in/tridibesh-nag-b9381b16a/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  background: 'rgba(168, 85, 247, 0.07)',
                  border: '1px solid rgba(168, 85, 247, 0.18)',
                  color: 'rgba(196, 181, 253, 0.85)',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(168, 85, 247, 0.14)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.38)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(168, 85, 247, 0.07)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168, 85, 247, 0.18)';
                }}
              >
                <Linkedin size={14} />
                LinkedIn
              </a>
            </div>
          </section>
        </main>
      </div>
    </div>

    {/* Footer */}
    <footer
      className="relative text-center py-6 text-xs"
      style={{ color: 'rgba(100, 116, 139, 0.5)', borderTop: '1px solid rgba(168, 85, 247, 0.07)' }}
    >
      © {new Date().getFullYear()} FiloRag · Built with ♥ by Tridibesh Nag
    </footer>
  </div>
);

export default AboutPage;
