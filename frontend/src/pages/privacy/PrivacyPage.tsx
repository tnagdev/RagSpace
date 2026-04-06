import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import logoImg from '@/assets/logo-filorag-bordered.png';

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

// ─── Section heading ─────────────────────────────────────────────────────────────
const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h2
    className="text-xl font-semibold mt-10 mb-3"
    style={{ color: '#e2e8f0' }}
  >
    {children}
  </h2>
);

// ─── Privacy Page ────────────────────────────────────────────────────────────────
const PrivacyPage = () => (
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
      <div
        className="absolute top-0 right-0 w-150 h-150 rounded-full blur-3xl animate-pulse"
        style={{ background: '#a855f7', opacity: 0.08, animationDuration: '9s' }}
      />
      <div
        className="absolute bottom-0 left-0 w-125 h-125 rounded-full blur-3xl animate-pulse"
        style={{ background: '#ec4899', opacity: 0.06, animationDuration: '11s', animationDelay: '3s' }}
      />
    </div>

    <div className="relative max-w-3xl mx-auto px-6 pt-32 pb-24">
      {/* Header */}
      <div className="mb-10">
        <div
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-4 px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.25)', color: '#c084fc' }}
        >
          Legal
        </div>
        <h1
          className="text-4xl font-bold leading-tight mb-4"
          style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #c084fc 60%, #f472b6 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Privacy Policy
        </h1>
        <p className="text-sm" style={{ color: 'rgba(148, 163, 184, 0.7)' }}>
          Last updated: April 6, 2026
        </p>
      </div>

      {/* Intro */}
      <div
        className="p-5 rounded-2xl mb-8"
        style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.15)' }}
      >
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(203, 213, 225, 0.85)' }}>
          Your privacy matters to us. This Privacy Policy explains what data FiloRag collects, how we use it,
          how we protect it, and what choices you have. We keep it straightforward — no hidden practices.
        </p>
      </div>

      <div className="text-sm leading-relaxed space-y-2" style={{ color: 'rgba(203, 213, 225, 0.8)' }}>

        {/* 1 */}
        <SectionHeading>1. Who We Are</SectionHeading>
        <p>
          FiloRag is an AI-powered video knowledge base service operated by Tridibesh Nag ("we", "us", "our").
          If you have any privacy-related questions or requests, you can reach us at{' '}
          <a
            href="mailto:support@filorag.com"
            style={{ color: '#c084fc', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            support@filorag.com
          </a>.
        </p>

        {/* 2 */}
        <SectionHeading>2. Information We Collect</SectionHeading>
        <p>We collect information in the following categories:</p>

        <p className="mt-3 font-medium" style={{ color: '#e2e8f0' }}>Account Information</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Email address, display name, and password hash (via our authentication provider).</li>
          <li>OAuth profile data if you sign up through Google or a third-party provider.</li>
        </ul>

        <p className="mt-3 font-medium" style={{ color: '#e2e8f0' }}>Uploaded Content</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Video and audio files you upload for processing.</li>
          <li>Derived data: transcripts, scene thumbnails, semantic embeddings, and timestamps generated from your content.</li>
          <li>Collection names and descriptions you create.</li>
        </ul>

        <p className="mt-3 font-medium" style={{ color: '#e2e8f0' }}>Usage Data</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Search queries you run against your content.</li>
          <li>Chat messages sent to AI assistants within the Service.</li>
          <li>Feature usage patterns and interaction logs for service improvement.</li>
          <li>IP address, browser type, and device information for security and analytics.</li>
        </ul>

        <p className="mt-3 font-medium" style={{ color: '#e2e8f0' }}>Payment Information</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Subscription plan, billing status, and transaction history.</li>
          <li>Payment processing is handled entirely by <strong style={{ color: '#e2e8f0' }}>Razorpay Software Private Limited</strong>, an RBI-authorised Payment Aggregator. We store only your Razorpay customer ID and subscription metadata — never your full card number, CVV, UPI PIN, or netbanking credentials.</li>
        </ul>

        {/* 3 */}
        <SectionHeading>3. How We Use Your Information</SectionHeading>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li><strong style={{ color: '#e2e8f0' }}>Deliver the Service:</strong> Process uploaded files through scene detection, transcription (via Whisper), and vector embedding (via CLIP) to power search and chat features.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Personalisation:</strong> Store your files, collections, search history, and preferences so the Service works correctly across sessions.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Communication:</strong> Send transactional emails such as email verification, password reset, subscription receipts, and important service announcements.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Security:</strong> Detect and prevent fraud, abuse, and unauthorised access to your account.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Improvement:</strong> Analyse aggregated usage patterns to improve features, fix bugs, and guide product roadmap decisions. We do not use your private content to train AI models.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Legal compliance:</strong> Comply with applicable Indian laws including the IT Act 2000, DPDPA 2023, and respond to lawful government or judicial requests, and enforce our Terms of Service.</li>
        </ul>

        {/* 4 */}
        <SectionHeading>4. How We Store Your Data</SectionHeading>
        <p>
          FiloRag uses the following infrastructure to store your data:
        </p>
        <ul className="list-disc list-inside space-y-1 pl-2 mt-2">
          <li><strong style={{ color: '#e2e8f0' }}>Google Cloud Storage / S3-compatible object storage:</strong> Your original video and audio files, along with generated thumbnails.</li>
          <li><strong style={{ color: '#e2e8f0' }}>PostgreSQL database:</strong> Your account details, file metadata, processing status, and subscription records.</li>
          <li><strong style={{ color: '#e2e8f0' }}>ChromaDB vector store:</strong> Semantic embeddings derived from your content, used exclusively to power your personal search and chat.</li>
        </ul>
        <p className="mt-2">
          All data in transit is encrypted via TLS. Data at rest is encrypted by our cloud storage provider.
          Embeddings and transcripts are logically isolated per account and are not accessible to other users.
        </p>

        {/* 5 */}
        <SectionHeading>5. Data Sharing and Third Parties</SectionHeading>
        <p>
          We do not sell your personal data. We share data only in the following limited circumstances:
        </p>
        <ul className="list-disc list-inside space-y-1 pl-2 mt-2">
          <li><strong style={{ color: '#e2e8f0' }}>Razorpay Software Private Limited:</strong> Payment processing, subject to Razorpay's privacy policy. Razorpay is an RBI-authorised Payment Aggregator regulated under the Payment and Settlement Systems Act, 2007.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Google Cloud Platform:</strong> Infrastructure hosting for our servers and file storage.</li>
          <li><strong style={{ color: '#e2e8f0' }}>OpenAI / Whisper API (if applicable):</strong> Audio transcription. Only audio content is submitted; no personally identifiable information is included in API requests.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Law enforcement / legal process:</strong> We may disclose data when required under the IT Act, 2000, the Code of Criminal Procedure, 1973, or any valid court order or direction from a government authority in India.</li>
        </ul>

        {/* 6 */}
        <SectionHeading>6. Cookies and Tracking</SectionHeading>
        <p>
          FiloRag uses session cookies to maintain your authentication state (via better-auth). We do not use
          third-party advertising cookies or cross-site tracking. We may use privacy-respecting, cookie-less
          analytics (such as aggregated page-view counts) without storing any personal identifiers.
        </p>

        {/* 7 */}
        <SectionHeading>7. Data Retention</SectionHeading>
        <p>
          We retain your account data and uploaded content for as long as your account is active. If you delete
          a file within the app, it is removed from our processing pipeline and storage within 7 days.
          If you delete your account, all associated data — including files, embeddings, and transcripts — is
          permanently deleted within 30 days, except where retention is required by law (e.g. financial records
          for 7 years).
        </p>
        <p className="mt-2">
          For inactive free accounts, we may delete uploaded content after 90 days of inactivity with prior
          email notice, as described in our Terms of Service.
        </p>

        {/* 8 */}
        <SectionHeading>8. Your Rights under DPDPA 2023</SectionHeading>
        <p>
          Under the <strong style={{ color: '#e2e8f0' }}>Digital Personal Data Protection Act, 2023 (DPDPA)</strong> and
          applicable Indian law, you (as a "Data Principal") have the following rights:
        </p>
        <ul className="list-disc list-inside space-y-1 pl-2 mt-2">
          <li><strong style={{ color: '#e2e8f0' }}>Right to Access:</strong> Obtain a summary of personal data we process and the purposes of processing.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Right to Correction and Erasure:</strong> Request correction of inaccurate data or erasure of data no longer necessary for the purpose it was collected.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Right to Grievance Redressal:</strong> File a complaint with our Grievance Officer (see Section 12) for any privacy concern, which we will address within 72 hours of acknowledgement.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Right to Nominate:</strong> Nominate another individual to exercise your rights in the event of your death or incapacity.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Right to Withdraw Consent:</strong> Withdraw consent for non-essential data processing at any time, without affecting the lawfulness of processing based on prior consent.</li>
          <li><strong style={{ color: '#e2e8f0' }}>Right to Data Portability:</strong> Request an export of your personal data in a structured, machine-readable format.</li>
        </ul>
        <p className="mt-2">
          To exercise any of these rights, contact our Grievance Officer at{' '}
          <a
            href="mailto:support@filorag.com"
            style={{ color: '#c084fc', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            support@filorag.com
          </a>. We will acknowledge within 48 hours and respond within 30 days. If unresolved, you may escalate
          to the <strong style={{ color: '#e2e8f0' }}>Data Protection Board of India</strong> once constituted under the DPDPA.
        </p>

        {/* 9 */}
        <SectionHeading>9. Children's Privacy</SectionHeading>
        <p>
          FiloRag is not directed at children under the age of 18. Under the DPDPA 2023, we do not process
          personal data of children (persons below 18 years) without verifiable parental or guardian consent.
          If you believe a child has registered without consent, please contact us and we will delete the
          account and associated data promptly.
        </p>

        {/* 10 */}
        <SectionHeading>10. Security</SectionHeading>
        <p>
          We implement industry-standard security measures including TLS encryption in transit, encrypted storage
          at rest, per-account access isolation, and regular security reviews. In the event of a personal data
          breach, we will notify affected users and report to the Data Protection Board of India within the
          timelines prescribed under the DPDPA 2023.
        </p>

        {/* 11 */}
        <SectionHeading>11. Changes to This Policy</SectionHeading>
        <p>
          We may update this Privacy Policy from time to time. When we do, we will revise the "Last updated"
          date. For material changes, we will notify you by email or via an in-app notice. Continued use of
          the Service after changes indicates your acceptance of the updated policy.
        </p>

        {/* 12 */}
        <SectionHeading>12. Grievance Officer</SectionHeading>
        <p>
          In accordance with the <strong style={{ color: '#e2e8f0' }}>Information Technology Act, 2000</strong>,
          the <strong style={{ color: '#e2e8f0' }}>IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong>,
          and the <strong style={{ color: '#e2e8f0' }}>Digital Personal Data Protection Act, 2023</strong>, we have
          appointed a Grievance Officer to address complaints and queries related to data processing:
        </p>
        <div
          className="mt-4 p-4 rounded-xl"
          style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.15)' }}
        >
          <p className="font-medium" style={{ color: '#e2e8f0' }}>Grievance Officer</p>
          <p className="mt-1">Name: Tridibesh Nag</p>
          <p>Designation: Founder & Data Controller</p>
          <p>
            Email:{' '}
            <a
              href="mailto:support@filorag.com"
              style={{ color: '#c084fc', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
            >
              support@filorag.com
            </a>
          </p>
          <p className="mt-1 text-xs" style={{ color: 'rgba(148, 163, 184, 0.6)' }}>
            Complaints will be acknowledged within 48 hours and resolved within 30 days of receipt.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div
        className="mt-16 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
        style={{ borderTop: '1px solid rgba(168, 85, 247, 0.12)', color: 'rgba(100, 116, 139, 0.7)' }}
      >
        <span>© {new Date().getFullYear()} FiloRag · Built with ♥ by Tridibesh Nag</span>
        <div className="flex items-center gap-4">
          <Link
            to="/terms"
            style={{ color: 'rgba(148, 163, 184, 0.6)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#a855f7')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148, 163, 184, 0.6)')}
          >
            Terms of Service
          </Link>
          <Link
            to="/about"
            style={{ color: 'rgba(148, 163, 184, 0.6)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#a855f7')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148, 163, 184, 0.6)')}
          >
            About
          </Link>
        </div>
      </div>
    </div>
  </div>
);

export default PrivacyPage;
