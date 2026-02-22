import { Link } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Play,
  Search,
  FolderOpen,
  MessageSquare,
  Zap,
  Clock,
  BookOpen,
  Upload,
  Cpu,
  Sparkles,
  ChevronRight,
  Check,
  ArrowRight,
  Video,
  FileText,
  Brain,
  ChevronLeft,
  Pause,
} from 'lucide-react';
import { paymentAPI } from '@/api/payment';
import { type Plan, PlanType, PlanInterval } from '@/types/payment.types';

import ss1 from '@/assets/images/Screenshot 2026-02-12 145521.png';
import ss2 from '@/assets/images/Screenshot 2026-02-12 150007.png';
import ss3 from '@/assets/images/Screenshot 2026-02-12 151837.png';
import ss4 from '@/assets/images/Screenshot 2026-02-12 151915.png';
import ss5 from '@/assets/images/Screenshot 2026-02-12 151943.png';
import ss6 from '@/assets/images/Screenshot 2026-02-12 152004.png';
import logoImg from '@/assets/logo-filorag-bordered.png';

// ─── Navbar ────────────────────────────────────────────────────────────────────
const Navbar = () => (
  <header className="fixed top-0 left-0 right-0 z-50" style={{ background: 'rgba(10, 10, 31, 0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(168, 85, 247, 0.1)' }}>
    <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      {/* Logo */}
      <div className="flex items-center">
        <img src={logoImg} alt="FiloRag" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
      </div>

      {/* Nav Links */}
      <nav className="hidden md:flex items-center gap-8">
        {['Features', 'How it Works', 'Use Cases', 'Pricing'].map((item) => (
          <a
            key={item}
            href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
            className="text-sm font-medium transition-colors duration-200"
            style={{ color: 'rgba(203, 213, 225, 0.8)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#a855f7')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(203, 213, 225, 0.8)')}
          >
            {item}
          </a>
        ))}
      </nav>

      {/* CTA */}
      <div className="flex items-center gap-3">
        <Link
          to="/auth/login"
          className="text-sm font-medium px-4 py-2 rounded-lg transition-all duration-200"
          style={{ color: 'rgba(203, 213, 225, 0.9)', textDecoration: 'none', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)' }}
        >
          Sign In
        </Link>
        <Link
          to="/auth/signup"
          className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', textDecoration: 'none', boxShadow: '0 0 20px rgba(168, 85, 247, 0.3)' }}
        >
          Get Started
        </Link>
      </div>
    </div>
  </header>
);

// ─── Hero ───────────────────────────────────────────────────────────────────────
const Hero = () => (
  <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{ background: '#0a0a1f' }}>
    {/* Background glows */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-150 h-150 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-125 h-125 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #ec4899 0%, transparent 70%)', filter: 'blur(60px)' }} />
      {/* Grid lines */}
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(168, 85, 247, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(168, 85, 247, 0.04) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
    </div>

    <div className="relative max-w-5xl mx-auto px-6 text-center pt-32 pb-20">
      {/* Headline */}
      <h1 className="font-bold leading-tight mb-6" style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', color: '#f8fafc', lineHeight: 1.15 }}>
        Talk to Your Videos.
        <br />
        <span style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Never Rewatch Again.
        </span>
      </h1>

      {/* Subtext */}
      <p className="text-lg md:text-xl max-w-2xl mx-auto mb-10" style={{ color: 'rgba(203, 213, 225, 0.75)', lineHeight: 1.7 }}>
        FiloRag understands your videos, lectures, and documents so you don't have to re-watch,
        re-read, or spend hours searching. Just ask — and get the exact moment, page, or answer you need.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
        <Link
          to="/auth/signup"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-semibold text-base transition-all duration-300"
          style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', textDecoration: 'none', boxShadow: '0 0 30px rgba(168, 85, 247, 0.4)' }}
        >
          Start for Free
          <ArrowRight size={18} />
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200"
          style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', color: '#c084fc', textDecoration: 'none' }}
        >
          <Play size={16} fill="currentColor" />
          See How It Works
        </a>
      </div>

      {/* Hero Screenshot */}
      <div className="relative max-w-5xl mx-auto">
        {/* Floating badges */}
        <div className="hidden md:flex absolute -left-6 top-1/3 z-10 items-center gap-2 px-3 py-2 rounded-xl shadow-xl" style={{ background: 'rgba(19, 19, 46, 0.95)', border: '1px solid rgba(168, 85, 247, 0.3)', backdropFilter: 'blur(12px)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
            <Brain size={14} className="text-white" />
          </div>
          <div>
            <div className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>AI Answer Ready</div>
            <div className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>Timestamp: 42:17</div>
          </div>
        </div>
        <div className="hidden md:flex absolute -right-6 top-1/4 z-10 items-center gap-2 px-3 py-2 rounded-xl shadow-xl" style={{ background: 'rgba(19, 19, 46, 0.95)', border: '1px solid rgba(236, 72, 153, 0.3)', backdropFilter: 'blur(12px)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(236, 72, 153, 0.2)' }}>
            <Search size={14} style={{ color: '#ec4899' }} />
          </div>
          <div>
            <div className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>Semantic Search</div>
            <div className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>Across all files</div>
          </div>
        </div>
        <div className="hidden md:flex absolute -right-4 bottom-1/4 z-10 items-center gap-2 px-3 py-2 rounded-xl shadow-xl" style={{ background: 'rgba(19, 19, 46, 0.95)', border: '1px solid rgba(96, 165, 250, 0.3)', backdropFilter: 'blur(12px)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(96, 165, 250, 0.15)' }}>
            <FolderOpen size={14} style={{ color: '#60a5fa' }} />
          </div>
          <div>
            <div className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>Collections</div>
            <div className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>Chat across all files</div>
          </div>
        </div>

        {/* Browser chrome frame */}
        <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 40px 120px rgba(168, 85, 247, 0.2), 0 0 0 1px rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
          {/* Window title bar */}
          <div className="flex items-center gap-2 px-5 py-3" style={{ background: 'rgba(10, 10, 31, 0.95)', borderBottom: '1px solid rgba(168, 85, 247, 0.1)' }}>
            <div className="w-3 h-3 rounded-full" style={{ background: '#f43f5e' }} />
            <div className="w-3 h-3 rounded-full" style={{ background: '#fbbf24' }} />
            <div className="w-3 h-3 rounded-full" style={{ background: '#34d399' }} />
            <div className="flex-1 mx-4 h-6 rounded-md flex items-center px-3" style={{ background: 'rgba(168, 85, 247, 0.07)', border: '1px solid rgba(168, 85, 247, 0.12)' }}>
              <span className="text-xs" style={{ color: 'rgba(148, 163, 184, 0.4)' }}>app.filorag.com/files</span>
            </div>
          </div>
          {/* Screenshot */}
          <img
            src={ss1}
            alt="FiloRag App — Files View"
            className="w-full block"
            style={{ maxHeight: '520px', objectFit: 'cover', objectPosition: 'top' }}
          />
        </div>
        {/* Glow under card */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-20 opacity-30 pointer-events-none" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', filter: 'blur(40px)' }} />
      </div>
    </div>
  </section>
);

// ─── Stats ──────────────────────────────────────────────────────────────────────
const Stats = () => (
  <section style={{ background: 'rgba(19, 19, 46, 0.8)', borderTop: '1px solid rgba(168, 85, 247, 0.1)', borderBottom: '1px solid rgba(168, 85, 247, 0.1)' }}>
    <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      {[
        { value: '10×', label: 'Faster content discovery' },
        { value: '5+', label: 'Supported file formats' },
        { value: '100%', label: 'Semantic understanding' },
        { value: 'Instant', label: 'Timestamp navigation' },
      ].map((stat, i) => (
        <div key={i} className="flex flex-col gap-1">
          <span className="text-3xl font-bold" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            {stat.value}
          </span>
          <span className="text-sm" style={{ color: 'rgba(148, 163, 184, 0.75)' }}>{stat.label}</span>
        </div>
      ))}
    </div>
  </section>
);

// ─── Features ──────────────────────────────────────────────────────────────────
const features = [
  {
    icon: Clock,
    iconBg: 'rgba(168, 85, 247, 0.12)',
    iconColor: '#a855f7',
    title: 'Jump to Any Moment',
    description: 'Watching a 3-hour lecture for one concept? Just ask FiloRag. It pinpoints the exact timestamp where it\'s explained — no scrubbing, no guessing.',
    tag: 'Video Intelligence',
    tagColor: 'rgba(168, 85, 247, 0.15)',
    tagText: '#c084fc',
  },
  {
    icon: MessageSquare,
    iconBg: 'rgba(236, 72, 153, 0.12)',
    iconColor: '#ec4899',
    title: 'Chat with Your Files',
    description: 'Your PDFs, videos, and notes become conversational. Ask questions, get summaries, pull out key insights — no more re-reading 50 pages.',
    tag: 'Smart Q&A',
    tagColor: 'rgba(236, 72, 153, 0.12)',
    tagText: '#f472b6',
  },
  {
    icon: FolderOpen,
    iconBg: 'rgba(96, 165, 250, 0.12)',
    iconColor: '#60a5fa',
    title: 'Collections for Deep Focus',
    description: 'Group your lectures, research papers, and notes into collections. Revise your entire study set by chatting across all files at once.',
    tag: 'Organized Study',
    tagColor: 'rgba(96, 165, 250, 0.1)',
    tagText: '#93c5fd',
  },
  {
    icon: Search,
    iconBg: 'rgba(52, 211, 153, 0.12)',
    iconColor: '#34d399',
    title: 'Search by Meaning',
    description: 'Forgot the filename? Describe what you\'re looking for and FiloRag finds it — searching by concept and context, not just keywords.',
    tag: 'Semantic Search',
    tagColor: 'rgba(52, 211, 153, 0.1)',
    tagText: '#6ee7b7',
  },
  {
    icon: Zap,
    iconBg: 'rgba(251, 191, 36, 0.12)',
    iconColor: '#fbbf24',
    title: 'Instant Video Insights',
    description: 'Long meetings, lengthy webinars, detailed tutorials — get a sharp summary of what matters, then drill into the exact section you need.',
    tag: 'Auto Summaries',
    tagColor: 'rgba(251, 191, 36, 0.1)',
    tagText: '#fde68a',
  },
  {
    icon: Brain,
    iconBg: 'rgba(168, 85, 247, 0.12)',
    iconColor: '#a855f7',
    title: 'Multi-Modal Understanding',
    description: 'FiloRag reads your visuals and listens to your audio — combining spoken words, on-screen text, and video context for complete understanding.',
    tag: 'Audio + Visual',
    tagColor: 'rgba(168, 85, 247, 0.1)',
    tagText: '#d8b4fe',
  },
];

const Features = () => (
  <section id="features" style={{ background: '#0a0a1f', padding: '100px 0' }}>
    <div className="max-w-6xl mx-auto px-6">
      {/* Header */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5" style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
          <Sparkles size={13} style={{ color: '#a855f7' }} />
          <span className="text-sm font-medium" style={{ color: '#c084fc' }}>Everything You Need</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#f8fafc' }}>
          Powerful Features,<br />
          <span style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Zero Complexity
          </span>
        </h2>
        <p className="text-lg max-w-xl mx-auto" style={{ color: 'rgba(148, 163, 184, 0.8)' }}>
          A complete intelligence layer on top of your content — built for students, researchers, and professionals.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f, i) => (
          <div
            key={i}
            className="group rounded-2xl p-6 flex flex-col gap-4 transition-all duration-300 cursor-default"
            style={{
              background: 'rgba(19, 19, 46, 0.9)',
              border: '1px solid rgba(168, 85, 247, 0.12)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.border = '1px solid rgba(168, 85, 247, 0.35)';
              e.currentTarget.style.background = 'rgba(26, 26, 62, 0.9)';
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.border = '1px solid rgba(168, 85, 247, 0.12)';
              e.currentTarget.style.background = 'rgba(19, 19, 46, 0.9)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: f.iconBg }}>
                <f.icon size={20} style={{ color: f.iconColor }} />
              </div>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: f.tagColor, color: f.tagText }}>
                {f.tag}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-base mb-2" style={{ color: '#f1f5f9' }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.8)' }}>{f.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─── App Showcase Carousel ────────────────────────────────────────────────────

// ---- per-slide widget definitions ----
const slide1Widgets = (
  <div className="flex flex-col gap-3">
    {/* file cards */}
    {[
      { icon: Video, name: 'Neural Networks — Lecture 4.mp4', size: '312 MB', status: 'Indexed', statusColor: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)' },
      { icon: FileText, name: 'Deep Learning Paper.pdf', size: '4.2 MB', status: 'Processing', statusColor: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' },
      { icon: Video, name: 'CS50 — Week 3 Algorithms.mp4', size: '890 MB', status: 'Indexed', statusColor: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)' },
    ].map((f, i) => (
      <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
        style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(168,85,247,0.15)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(168,85,247,0.12)' }}>
          <f.icon size={14} style={{ color: '#a855f7' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" style={{ color: '#f1f5f9' }}>{f.name}</div>
          <div className="text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>{f.size}</div>
        </div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
          style={{ background: f.bg, color: f.statusColor, border: `1px solid ${f.border}` }}>
          {f.status}
        </span>
      </div>
    ))}
  </div>
);

const slide2Widgets = (
  <div className="flex flex-col gap-3">
    {/* stat cards row */}
    <div className="grid grid-cols-2 gap-2">
      {[
        { label: 'Files Indexed', value: '24', icon: FileText, color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
        { label: 'Queries Today', value: '137', icon: MessageSquare, color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
        { label: 'Hours Saved', value: '18h', icon: Clock, color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
        { label: 'Collections', value: '5', icon: FolderOpen, color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
      ].map((s, i) => (
        <div key={i} className="rounded-xl p-3 flex items-center gap-2"
          style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(168,85,247,0.12)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg }}>
            <s.icon size={13} style={{ color: s.color }} />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: '#f8fafc' }}>{s.value}</div>
            <div style={{ color: 'rgba(148,163,184,0.65)', fontSize: '10px' }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
    {/* processing pipeline */}
    <div className="rounded-xl p-3" style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(168,85,247,0.12)' }}>
      <div className="text-xs font-semibold mb-2" style={{ color: 'rgba(148,163,184,0.7)' }}>Processing Pipeline</div>
      <div className="flex items-center gap-1">
        {['Upload', 'Embed', 'Detect', 'Index', 'Done'].map((step, i, arr) => (
          <>
            <div key={step} className="flex items-center gap-1">
              <div className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: i < 4 ? 'rgba(168,85,247,0.2)' : 'rgba(52,211,153,0.15)',
                  color: i < 4 ? '#c084fc' : '#34d399',
                  border: `1px solid ${i < 4 ? 'rgba(168,85,247,0.3)' : 'rgba(52,211,153,0.3)'}`,
                  fontSize: '10px',
                }}>{step}</div>
            </div>
            {i < arr.length - 1 && <div style={{ color: 'rgba(148,163,184,0.3)', fontSize: '10px' }}>›</div>}
          </>
        ))}
      </div>
    </div>
  </div>
);

const slide3Widgets = (
  <div className="flex flex-col gap-3">
    {/* chat bubbles */}
    <div className="flex justify-end">
      <div className="rounded-2xl rounded-tr-sm px-3 py-2 text-xs max-w-[85%]"
        style={{ background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.25)', color: 'rgba(203,213,225,0.9)' }}>
        Where is backpropagation explained?
      </div>
    </div>
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
        <Brain size={12} className="text-white" />
      </div>
      <div className="rounded-2xl rounded-tl-sm px-3 py-2 text-xs"
        style={{ background: 'rgba(19,19,46,0.95)', border: '1px solid rgba(168,85,247,0.2)', color: 'rgba(203,213,225,0.9)' }}>
        Backpropagation is covered at{' '}
        <span style={{ color: '#a855f7', fontWeight: 600 }}>42:17</span>. It's explained with a gradient descent visual. Want me to jump there?
      </div>
    </div>
    {/* timestamp card */}
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer"
      style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'rgba(236,72,153,0.2)' }}>
        <Play size={12} fill="currentColor" style={{ color: '#ec4899' }} />
      </div>
      <div className="flex-1">
        <div className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>Jump to timestamp</div>
        <div className="text-xs" style={{ color: 'rgba(148,163,184,0.65)' }}>42:17 — Backpropagation</div>
      </div>
      <ArrowRight size={13} style={{ color: '#ec4899' }} />
    </div>
  </div>
);

const slide4Widgets = (
  <div className="flex flex-col gap-3">
    {/* scene thumbnails row */}
    <div className="text-xs font-semibold mb-1" style={{ color: 'rgba(148,163,184,0.6)' }}>Detected Scenes</div>
    <div className="grid grid-cols-3 gap-2">
      {[
        { time: '02:14', label: 'Intro' },
        { time: '18:40', label: 'Key concept' },
        { time: '42:17', label: 'Backprop', active: true },
      ].map((sc, i) => (
        <div key={i} className="rounded-lg overflow-hidden"
          style={{ border: sc.active ? '1.5px solid #ec4899' : '1px solid rgba(168,85,247,0.15)' }}>
          <div className="h-10 flex items-center justify-center"
            style={{ background: sc.active ? 'rgba(236,72,153,0.15)' : 'rgba(168,85,247,0.07)' }}>
            <Play size={12} fill="currentColor" style={{ color: sc.active ? '#ec4899' : '#a855f7' }} />
          </div>
          <div className="px-1.5 py-1" style={{ background: 'rgba(13,13,36,0.97)' }}>
            <div className="font-semibold" style={{ color: sc.active ? '#f472b6' : '#c084fc', fontSize: '10px' }}>{sc.time}</div>
            <div style={{ color: 'rgba(148,163,184,0.6)', fontSize: '9px' }}>{sc.label}</div>
          </div>
        </div>
      ))}
    </div>
    {/* seek bar */}
    <div className="rounded-xl p-3" style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(168,85,247,0.12)' }}>
      <div className="flex justify-between text-xs mb-1.5" style={{ color: 'rgba(148,163,184,0.6)' }}>
        <span>42:17</span><span>1:08:32</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(168,85,247,0.15)' }}>
        <div className="h-full rounded-full w-[62%]" style={{ background: 'linear-gradient(90deg, #a855f7, #ec4899)' }} />
      </div>
    </div>
  </div>
);

const slide5Widgets = (
  <div className="flex flex-col gap-3">
    {/* collection card */}
    <div className="rounded-xl p-3" style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(96,165,250,0.2)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.15)' }}>
          <FolderOpen size={13} style={{ color: '#60a5fa' }} />
        </div>
        <div>
          <div className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>ML Course — Semester 2</div>
          <div style={{ color: 'rgba(148,163,184,0.55)', fontSize: '10px' }}>6 files · 4.2 GB</div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {['Lecture 1–4 (Videos)', 'Research Papers (PDF)', 'Lab Notes (PDF)'].map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(148,163,184,0.75)' }}>
            <div className="w-1 h-1 rounded-full" style={{ background: '#60a5fa' }} />
            {f}
          </div>
        ))}
      </div>
    </div>
    {/* chat across collection */}
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
        <Brain size={12} className="text-white" />
      </div>
      <div className="rounded-2xl rounded-tl-sm px-3 py-2 text-xs"
        style={{ background: 'rgba(19,19,46,0.95)', border: '1px solid rgba(96,165,250,0.2)', color: 'rgba(203,213,225,0.9)' }}>
        Based on <span style={{ color: '#60a5fa', fontWeight: 600 }}>all 6 files</span>, the key difference between SGD and Adam is the adaptive learning rate…
      </div>
    </div>
  </div>
);

const slide6Widgets = (
  <div className="flex flex-col gap-3">
    {/* search bar */}
    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
      style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(52,211,153,0.25)' }}>
      <Search size={13} style={{ color: '#34d399' }} />
      <span className="text-xs" style={{ color: 'rgba(148,163,184,0.5)' }}>"explain overfitting with visuals"</span>
    </div>
    {/* results */}
    {[
      { file: 'Lecture 3.mp4', match: 'Overfitting demo at 28:04', score: '97%', color: '#34d399' },
      { file: 'Deep Learning Paper.pdf', match: 'Section 4.2 — Regularization', score: '91%', color: '#a855f7' },
      { file: 'Lab Notes.pdf', match: 'L2 regularization example', score: '84%', color: '#60a5fa' },
    ].map((r, i) => (
      <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
        style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(168,85,247,0.1)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(168,85,247,0.1)' }}>
          <FileText size={12} style={{ color: '#a855f7' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" style={{ color: '#f1f5f9' }}>{r.file}</div>
          <div className="text-xs truncate" style={{ color: 'rgba(148,163,184,0.6)' }}>{r.match}</div>
        </div>
        <span className="text-xs font-bold shrink-0" style={{ color: r.color }}>{r.score}</span>
      </div>
    ))}
  </div>
);

// ---- slide data ----
const carouselSlides = [
  {
    img: ss1,
    badge: 'My Files',
    badgeBg: 'rgba(168,85,247,0.12)',
    badgeBorder: 'rgba(168,85,247,0.25)',
    badgeColor: '#c084fc',
    badgeIcon: FileText,
    accent: '#a855f7',
    title: 'Your Intelligent File Library',
    description: 'Every upload is automatically processed, transcribed, and indexed — ready to be searched or chatted with the moment it lands.',
    widgets: slide1Widgets,
  },
  {
    img: ss2,
    badge: 'Dashboard',
    badgeBg: 'rgba(236,72,153,0.1)',
    badgeBorder: 'rgba(236,72,153,0.25)',
    badgeColor: '#f472b6',
    badgeIcon: Zap,
    accent: '#ec4899',
    title: 'Everything at a Glance',
    description: 'Track your content, monitor processing pipelines, and jump straight to what you need — all from one clean dashboard.',
    widgets: slide2Widgets,
  },
  {
    img: ss3,
    badge: 'File Chat',
    badgeBg: 'rgba(168,85,247,0.12)',
    badgeBorder: 'rgba(168,85,247,0.25)',
    badgeColor: '#c084fc',
    badgeIcon: MessageSquare,
    accent: '#a855f7',
    title: 'Chat Directly with Any File',
    description: 'Ask questions, request summaries, or dig into specifics. Your AI assistant knows the exact content of every file you upload.',
    widgets: slide3Widgets,
  },
  {
    img: ss4,
    badge: 'Timestamps',
    badgeBg: 'rgba(236,72,153,0.1)',
    badgeBorder: 'rgba(236,72,153,0.25)',
    badgeColor: '#f472b6',
    badgeIcon: Clock,
    accent: '#ec4899',
    title: 'Skip Straight to the Moment',
    description: 'FiloRag detects every scene and spoken concept in your videos. Ask anything — and jump to the exact second it\'s explained.',
    widgets: slide4Widgets,
  },
  {
    img: ss5,
    badge: 'Collections',
    badgeBg: 'rgba(96,165,250,0.1)',
    badgeBorder: 'rgba(96,165,250,0.25)',
    badgeColor: '#93c5fd',
    badgeIcon: FolderOpen,
    accent: '#60a5fa',
    title: 'Group Files, Study Smarter',
    description: 'Bundle lectures, papers, and notes into collections then chat across all of them at once. Perfect for exam prep or research deep-dives.',
    widgets: slide5Widgets,
  },
  {
    img: ss6,
    badge: 'Semantic Search',
    badgeBg: 'rgba(52,211,153,0.1)',
    badgeBorder: 'rgba(52,211,153,0.25)',
    badgeColor: '#6ee7b7',
    badgeIcon: Search,
    accent: '#34d399',
    title: 'Search by Meaning, Not Keywords',
    description: 'Describe what you\'re looking for the way you\'d say it out loud. FiloRag surfaces the most relevant files, scenes, and passages instantly.',
    widgets: slide6Widgets,
  },
];

const AppShowcase = () => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = carouselSlides.length;

  const next = useCallback(() => setActive(a => (a + 1) % total), [total]);
  const prev = useCallback(() => setActive(a => (a - 1 + total) % total), [total]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [paused, next]);

  const slide = carouselSlides[active];

  return (
    <section id="see-it-in-action" style={{ background: '#0d0d24', padding: '100px 0', overflow: 'hidden' }}>
      <div className="max-w-6xl mx-auto px-6">

        {/* ── header ── */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5"
            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
            <Play size={13} style={{ color: '#a855f7' }} fill="currentColor" />
            <span className="text-sm font-medium" style={{ color: '#c084fc' }}>See It In Action</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#f8fafc' }}>
            A Smarter Way to Work<br />
            <span style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              With Your Content
            </span>
          </h2>
          <p className="text-base max-w-lg mx-auto" style={{ color: 'rgba(148,163,184,0.8)' }}>
            Every view. Every interaction. Designed to help you learn faster and know deeper.
          </p>
        </div>

        {/* ── carousel card ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(13,13,36,0.97)',
            border: `1px solid ${slide.accent}33`,
            boxShadow: `0 24px 80px ${slide.accent}18`,
            transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-5">

            {/* ── LEFT: info panel ── */}
            <div className="lg:col-span-2 flex flex-col justify-between gap-6 p-7"
              style={{ borderRight: '1px solid rgba(168,85,247,0.08)' }}>

              {/* badge + title + desc */}
              <div className="flex flex-col gap-4">
                <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full"
                  style={{ background: slide.badgeBg, border: `1px solid ${slide.badgeBorder}` }}>
                  <slide.badgeIcon size={12} style={{ color: slide.badgeColor }} />
                  <span className="text-xs font-semibold" style={{ color: slide.badgeColor }}>{slide.badge}</span>
                </div>
                <h3 className="text-xl font-bold leading-snug" style={{ color: '#f8fafc' }}>{slide.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(148,163,184,0.8)' }}>{slide.description}</p>
              </div>

              {/* widgets */}
              <div>{slide.widgets}</div>

              {/* controls */}
              <div className="flex items-center justify-between">
                {/* dots */}
                <div className="flex items-center gap-1.5">
                  {carouselSlides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setActive(i); setPaused(true); }}
                      style={{
                        width: i === active ? '20px' : '6px',
                        height: '6px',
                        borderRadius: '999px',
                        background: i === active
                          ? `linear-gradient(90deg, ${slide.accent}, #ec4899)`
                          : 'rgba(168,85,247,0.25)',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'all 0.3s ease',
                      }}
                    />
                  ))}
                </div>

                {/* prev / next */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { prev(); setPaused(true); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                    style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', cursor: 'pointer', color: '#c084fc' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    onClick={() => { setPaused(p => !p); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                    style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', cursor: 'pointer', color: '#c084fc' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
                  >
                    {paused ? <Play size={12} fill="currentColor" /> : <Pause size={13} />}
                  </button>
                  <button
                    onClick={() => { next(); setPaused(true); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                    style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', cursor: 'pointer', color: '#c084fc' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT: screenshot ── */}
            <div className="lg:col-span-3 relative flex flex-col" style={{ background: '#0a0a1f' }}>
              {/* browser chrome */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 shrink-0"
                style={{ background: 'rgba(10,10,31,0.95)', borderBottom: `1px solid ${slide.accent}22` }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f43f5e' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#fbbf24' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#34d399' }} />
                <div className="flex-1 mx-3 h-5 rounded-md flex items-center px-2.5"
                  style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.1)' }}>
                  <span style={{ color: 'rgba(148,163,184,0.35)', fontSize: '10px' }}>app.filorag.com</span>
                </div>
              </div>
              {/* image */}
              <div className="relative overflow-hidden h-full" style={{ minHeight: '360px' }}>
                <img
                  key={active}
                  src={slide.img}
                  alt={slide.title}
                  className="w-full block"
                  style={{
                    height: '100%',
                    minHeight: '360px',
                    objectFit: 'contain',
                    objectPosition: 'center',
                    animation: 'fadeSlide 0.45s ease',
                  }}
                />
                {/* progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: 'rgba(168,85,247,0.12)' }}>
                  {!paused && (
                    <div
                      key={`prog-${active}`}
                      className="h-full"
                      style={{
                        background: `linear-gradient(90deg, ${slide.accent}, #ec4899)`,
                        animation: 'progress 5s linear forwards',
                        transformOrigin: 'left',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── slide tab strip ── */}
        <div className="flex gap-2 mt-5 flex-wrap justify-center">
          {carouselSlides.map((s, i) => (
            <button
              key={i}
              onClick={() => { setActive(i); setPaused(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
              style={{
                background: i === active ? `${s.accent}22` : 'rgba(168,85,247,0.05)',
                border: i === active ? `1px solid ${s.accent}55` : '1px solid rgba(168,85,247,0.1)',
                color: i === active ? s.badgeColor : 'rgba(148,163,184,0.6)',
                cursor: 'pointer',
              }}
            >
              <s.badgeIcon size={11} />
              {s.badge}
            </button>
          ))}
        </div>
      </div>

      {/* keyframe styles */}
      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes progress {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </section>
  );
};

// ─── How It Works ───────────────────────────────────────────────────────────────
const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Upload Your Content',
    description: 'Drop in your lecture recordings, research videos, PDFs, or any file. FiloRag handles videos, documents, and more.',
  },
  {
    number: '02',
    icon: Cpu,
    title: 'AI Processes Everything',
    description: 'Your content is analyzed frame-by-frame, word-by-word. Scenes are detected, audio transcribed, text embedded — ready to understand.',
  },
  {
    number: '03',
    icon: MessageSquare,
    title: 'Ask. Find. Know.',
    description: 'Chat with your files, jump to exact timestamps, search across everything, and get instant answers — all in natural language.',
  },
];

const HowItWorks = () => (
  <section id="how-it-works" style={{ background: '#0d0d24', padding: '100px 0' }}>
    <div className="max-w-5xl mx-auto px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5" style={{ background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
          <Zap size={13} style={{ color: '#ec4899' }} />
          <span className="text-sm font-medium" style={{ color: '#f472b6' }}>How It Works</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#f8fafc' }}>
          From Upload to Insight
          <br />
          <span style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            in Three Simple Steps
          </span>
        </h2>
        <p className="text-base max-w-lg mx-auto" style={{ color: 'rgba(148, 163, 184, 0.8)' }}>
          No setup. No complexity. Start getting answers from your content in minutes.
        </p>
      </div>

      <div className="relative">
        {/* Connector line */}
        <div className="hidden md:block absolute top-14 left-1/6 right-1/6 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.4), rgba(236, 72, 153, 0.4), transparent)' }} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center gap-5">
              <div className="relative">
                <div className="w-28 h-28 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(236, 72, 153, 0.1))', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
                  <step.icon size={32} style={{ color: '#a855f7' }} />
                </div>
                <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: 'white' }}>
                  {i + 1}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2" style={{ color: '#f1f5f9' }}>{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.8)' }}>{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ─── Use Cases ──────────────────────────────────────────────────────────────────
const useCases = [
  {
    emoji: '🎓',
    audience: 'For Students',
    title: 'Your 24/7 Study Companion',
    points: [
      'Skip to the exact moment a concept is explained',
      'Summarize a full lecture in seconds',
      'Chat with your notes before an exam',
      'Build study collections across subjects',
    ],
    gradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(236, 72, 153, 0.06))',
    border: 'rgba(168, 85, 247, 0.2)',
  },
  {
    emoji: '🔬',
    audience: 'For Researchers',
    title: 'Navigate Knowledge at Scale',
    points: [
      'Ask questions across entire paper collections',
      'Extract key findings from long research videos',
      'Find evidence in recorded interviews',
      'Compare insights across multiple sources at once',
    ],
    gradient: 'linear-gradient(135deg, rgba(96, 165, 250, 0.12), rgba(168, 85, 247, 0.06))',
    border: 'rgba(96, 165, 250, 0.2)',
  },
  {
    emoji: '💼',
    audience: 'For Professionals',
    title: 'Work Smarter, Not Harder',
    points: [
      'Catch up on missed meetings by asking what happened',
      'Pull action items from long recorded sessions',
      'Search your training materials by topic',
      'Get instant answers from internal documentation',
    ],
    gradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.12), rgba(96, 165, 250, 0.06))',
    border: 'rgba(52, 211, 153, 0.2)',
  },
];

const UseCases = () => (
  <section id="use-cases" style={{ background: '#0a0a1f', padding: '100px 0' }}>
    <div className="max-w-6xl mx-auto px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5" style={{ background: 'rgba(96, 165, 250, 0.1)', border: '1px solid rgba(96, 165, 250, 0.2)' }}>
          <BookOpen size={13} style={{ color: '#60a5fa' }} />
          <span className="text-sm font-medium" style={{ color: '#93c5fd' }}>Built for Everyone</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#f8fafc' }}>
          Who Uses FiloRag?
        </h2>
        <p className="text-base max-w-lg mx-auto" style={{ color: 'rgba(148, 163, 184, 0.8)' }}>
          Whether you're studying, researching, or managing knowledge at work — FiloRag transforms how you interact with information.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {useCases.map((uc, i) => (
          <div
            key={i}
            className="rounded-2xl p-7 flex flex-col gap-5"
            style={{ background: uc.gradient, border: `1px solid ${uc.border}` }}
          >
            <div>
              <div className="text-3xl mb-3">{uc.emoji}</div>
              <div className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'rgba(148, 163, 184, 0.6)' }}>{uc.audience}</div>
              <h3 className="text-lg font-bold" style={{ color: '#f1f5f9' }}>{uc.title}</h3>
            </div>
            <ul className="flex flex-col gap-2.5">
              {uc.points.map((pt, j) => (
                <li key={j} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(203, 213, 225, 0.85)' }}>
                  <Check size={15} style={{ color: '#a855f7', flexShrink: 0, marginTop: '2px' }} />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─── Pricing ────────────────────────────────────────────────────────────────────

const planMeta: Record<string, { highlight: boolean; badge?: string; ctaLabel: string; checkColor: string }> = {
  [PlanType.FREE]:  { highlight: false, ctaLabel: 'Get Started Free',  checkColor: '#34d399' },
  [PlanType.BASIC]: { highlight: false, ctaLabel: 'Start Basic Plan',  checkColor: '#60a5fa' },
  [PlanType.PRO]:   { highlight: true,  badge: 'Most Popular', ctaLabel: 'Start Pro Trial', checkColor: '#a855f7' },
};

const formatPrice = (price: number, priceUnit: string): string => {
  if (price === 0) return 'INR 0';
  // LemonSqueezy stores prices in cents
  const amount = price;
  const symbol = priceUnit.length === 3
    ? (priceUnit.toUpperCase() === 'USD' ? '$'
      : priceUnit.toUpperCase() === 'EUR' ? '€'
      : priceUnit.toUpperCase() === 'GBP' ? '£'
      : priceUnit.toUpperCase() === 'INR' ? '₹'
      : priceUnit)
    : priceUnit;
  return `${symbol}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
};

const formatInterval = (interval: PlanInterval): string =>
  interval === PlanInterval.YEARLY ? '/year' : '/month';

const PricingSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {[0, 1, 2].map(i => (
      <div key={i} className="rounded-2xl p-7 flex flex-col gap-5"
        style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(168,85,247,0.12)', minHeight: '380px' }}>
        <div className="animate-pulse flex flex-col gap-4">
          <div className="h-4 w-16 rounded-full" style={{ background: 'rgba(168,85,247,0.15)' }} />
          <div className="h-10 w-24 rounded-lg" style={{ background: 'rgba(168,85,247,0.1)' }} />
          <div className="h-3 w-40 rounded" style={{ background: 'rgba(168,85,247,0.08)' }} />
          <div className="flex flex-col gap-2 mt-2">
            {[1, 2, 3, 4].map(j => (
              <div key={j} className="h-3 rounded" style={{ background: 'rgba(168,85,247,0.07)', width: `${60 + j * 8}%` }} />
            ))}
          </div>
        </div>
      </div>
    ))}
  </div>
);

const PlanCard = ({ plan, interval }: { plan: Plan; interval: PlanInterval }) => {
  const meta = planMeta[plan.type] ?? { highlight: false, ctaLabel: `Get ${plan.name}`, checkColor: '#34d399' };
  const priceStr = formatPrice(plan.price, plan.priceUnit);
  const periodStr = formatInterval(interval);

  return (
    <div
      className="rounded-2xl p-7 flex flex-col gap-5 relative"
      style={{
        background: meta.highlight
          ? 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.08))'
          : 'rgba(19,19,46,0.9)',
        border: meta.highlight
          ? '1px solid rgba(168,85,247,0.4)'
          : '1px solid rgba(168,85,247,0.12)',
        boxShadow: meta.highlight ? '0 0 40px rgba(168,85,247,0.1)' : 'none',
      }}
    >
      {meta.badge && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full text-white"
          style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', whiteSpace: 'nowrap' }}
        >
          {meta.badge}
        </div>
      )}

      {/* name + price */}
      <div>
        <div className="text-sm font-semibold mb-1"
          style={{ color: meta.highlight ? '#c084fc' : 'rgba(148,163,184,0.8)' }}>
          {plan.name}
        </div>
        <div className="flex items-end gap-1 mb-1">
          <span className="text-4xl font-bold" style={{ color: '#f8fafc' }}>{priceStr}</span>
          <span className="text-sm pb-1" style={{ color: 'rgba(148,163,184,0.55)' }}>{periodStr}</span>
        </div>
        {plan.description && (
          <p className="text-xs" style={{ color: 'rgba(148,163,184,0.7)' }}>{plan.description}</p>
        )}
      </div>

      {/* features */}
      <ul className="flex flex-col gap-2 flex-1">
        {(plan.features ?? []).map((f, j) => (
          <li key={j} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(203,213,225,0.85)' }}>
            <Check size={14} style={{ color: meta.checkColor, flexShrink: 0, marginTop: '2px' }} />
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link
        to="/auth/signup"
        className="block text-center rounded-xl py-3 font-semibold text-sm transition-all duration-200"
        style={{
          background: meta.highlight ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'rgba(168,85,247,0.1)',
          color: meta.highlight ? 'white' : '#c084fc',
          border: meta.highlight ? 'none' : '1px solid rgba(168,85,247,0.25)',
          textDecoration: 'none',
          boxShadow: meta.highlight ? '0 0 20px rgba(168,85,247,0.3)' : 'none',
        }}
      >
        {meta.ctaLabel}
      </Link>
    </div>
  );
};

const Pricing = () => {
  const [billingInterval, setBillingInterval] = useState<PlanInterval>(PlanInterval.MONTHLY);

  const { data: allPlans, isLoading, isError } = useQuery({
    queryKey: ['landing-plans'],
    queryFn: () => paymentAPI.getPlansWithComparison(),
    staleTime: 1000 * 60 * 10,
    retry: 2,
  });

  const hasYearly = (allPlans ?? []).some(p => p.interval === PlanInterval.YEARLY);
  const plans = (allPlans ?? []).filter(p => p.interval === billingInterval);
  const fallbackPlans = (allPlans ?? []).filter(p => p.interval === PlanInterval.MONTHLY);
  const displayPlans = plans.length > 0 ? plans : fallbackPlans;

  return (
    <section id="pricing" style={{ background: '#0d0d24', padding: '100px 0' }}>
      <div className="max-w-5xl mx-auto px-6">

        {/* header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5"
            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
            <Sparkles size={13} style={{ color: '#a855f7' }} />
            <span className="text-sm font-medium" style={{ color: '#c084fc' }}>Simple Pricing</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#f8fafc' }}>
            Choose Your Plan
          </h2>
          <p className="text-base max-w-lg mx-auto mb-8" style={{ color: 'rgba(148,163,184,0.8)' }}>
            Start free, upgrade when you're ready. No hidden fees.
          </p>

          {/* billing interval toggle — only shown when yearly plans exist */}
          {!isLoading && hasYearly && (
            <div className="inline-flex items-center gap-1 p-1 rounded-xl"
              style={{ background: 'rgba(19,19,46,0.9)', border: '1px solid rgba(168,85,247,0.15)' }}>
              {([PlanInterval.MONTHLY, PlanInterval.YEARLY] as PlanInterval[]).map(iv => (
                <button
                  key={iv}
                  onClick={() => setBillingInterval(iv)}
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 inline-flex items-center gap-2"
                  style={{
                    background: billingInterval === iv ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'transparent',
                    color: billingInterval === iv ? 'white' : 'rgba(148,163,184,0.7)',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: billingInterval === iv ? '0 0 16px rgba(168,85,247,0.25)' : 'none',
                  }}
                >
                  {iv === PlanInterval.MONTHLY ? 'Monthly' : 'Yearly'}
                  {iv === PlanInterval.YEARLY && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(52,211,153,0.2)', color: '#34d399' }}>
                      Save 20%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* skeleton */}
        {isLoading && <PricingSkeleton />}

        {/* error state */}
        {isError && (
          <div className="text-center py-12" style={{ color: 'rgba(148,163,184,0.6)' }}>
            <div className="text-base mb-2">Couldn't load plans right now.</div>
            <Link to="/auth/signup" className="text-sm" style={{ color: '#a855f7', textDecoration: 'none' }}>
              Sign up free to see pricing →
            </Link>
          </div>
        )}

        {/* plan cards */}
        {!isLoading && !isError && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayPlans.map(plan => (
              <PlanCard key={plan.id} plan={plan} interval={plans.length > 0 ? billingInterval : PlanInterval.MONTHLY} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// ─── Final CTA ──────────────────────────────────────────────────────────────────
const FinalCTA = () => (
  <section style={{ background: '#0a0a1f', padding: '100px 0' }}>
    <div className="max-w-3xl mx-auto px-6 text-center">
      {/* Glow */}
      <div className="relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-40 opacity-20 pointer-events-none" style={{ background: 'radial-gradient(ellipse, #a855f7 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div className="relative rounded-3xl p-12 flex flex-col items-center gap-6" style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(236, 72, 153, 0.06))', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
          <img src={logoImg} alt="FiloRag" className="h-14 w-auto object-contain" />
          <h2 className="text-3xl md:text-4xl font-bold" style={{ color: '#f8fafc', lineHeight: 1.2 }}>
            Your content is waiting<br />
            <span style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              to be understood.
            </span>
          </h2>
          <p className="text-base max-w-md" style={{ color: 'rgba(148, 163, 184, 0.8)', lineHeight: 1.7 }}>
            Join thousands of students, researchers, and professionals who are already learning smarter with FiloRag.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <Link
              to="/auth/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-semibold text-base transition-all duration-300"
              style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', textDecoration: 'none', boxShadow: '0 0 30px rgba(168, 85, 247, 0.4)' }}
            >
              Start for Free
              <ChevronRight size={18} />
            </Link>
            <Link
              to="/auth/login"
              className="text-sm font-medium"
              style={{ color: 'rgba(148, 163, 184, 0.7)', textDecoration: 'none' }}
            >
              Already have an account? Sign in →
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── Footer ─────────────────────────────────────────────────────────────────────
const Footer = () => (
  <footer style={{ background: '#070714', borderTop: '1px solid rgba(168, 85, 247, 0.08)', padding: '48px 0 32px' }}>
    <div className="max-w-6xl mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
        {/* Brand */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="flex items-center">
            <img src={logoImg} alt="FiloRag" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
          </div>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: 'rgba(148, 163, 184, 0.6)' }}>
            Your personal AI knowledge base. Ask your videos, lectures, and documents anything — no rewatching required.
          </p>
        </div>

        {/* Product links */}
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(148, 163, 184, 0.4)' }}>Product</div>
          {['Features', 'How it Works', 'Pricing', 'Changelog'].map(link => (
            <a key={link} href="#" className="text-sm transition-colors duration-200" style={{ color: 'rgba(148, 163, 184, 0.65)', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#a855f7')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148, 163, 184, 0.65)')}>
              {link}
            </a>
          ))}
        </div>

        {/* Company links */}
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(148, 163, 184, 0.4)' }}>Company</div>
          {['About', 'Blog', 'Privacy Policy', 'Terms of Service'].map(link => (
            <a key={link} href="#" className="text-sm transition-colors duration-200" style={{ color: 'rgba(148, 163, 184, 0.65)', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#a855f7')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148, 163, 184, 0.65)')}>
              {link}
            </a>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between pt-6 gap-4" style={{ borderTop: '1px solid rgba(168, 85, 247, 0.08)' }}>
        <p className="text-xs" style={{ color: 'rgba(100, 116, 139, 0.7)' }}>
          © {new Date().getFullYear()} FiloRag. All rights reserved.
        </p>
        <p className="text-xs" style={{ color: 'rgba(100, 116, 139, 0.5)' }}>
          Built with ♥ for curious minds
        </p>
      </div>
    </div>
  </footer>
);

// ─── Main Landing Page ──────────────────────────────────────────────────────────
const LandingPage = () => {
  return (
    <div style={{ fontFamily: '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh' }}>
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Features />
        <AppShowcase />
        <HowItWorks />
        <UseCases />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
