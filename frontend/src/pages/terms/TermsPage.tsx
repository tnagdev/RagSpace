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

// ─── Terms Page ─────────────────────────────────────────────────────────────────
const TermsPage = () => (
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
        className="absolute top-0 left-0 w-150 h-150 rounded-full blur-3xl animate-pulse"
        style={{ background: '#a855f7', opacity: 0.08, animationDuration: '9s' }}
      />
      <div
        className="absolute bottom-0 right-0 w-125 h-125 rounded-full blur-3xl animate-pulse"
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
          Terms of Service
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
          Please read these Terms of Service ("Terms") carefully before using FiloRag. By creating an account or
          accessing our platform, you agree to be bound by these Terms. If you do not agree, you may not use
          the service.
        </p>
      </div>

      <div className="text-sm leading-relaxed space-y-2" style={{ color: 'rgba(203, 213, 225, 0.8)' }}>

        {/* 1 */}
        <SectionHeading>1. Acceptance of Terms</SectionHeading>
        <p>
          These Terms constitute a legally binding agreement between you ("User") and FiloRag ("we", "us", "our").
          By registering for an account, uploading content, or otherwise using FiloRag, you confirm that you are
          at least 13 years old (or the minimum age of digital consent in your jurisdiction) and have the legal
          capacity to enter into this agreement.
        </p>

        {/* 2 */}
        <SectionHeading>2. Description of Service</SectionHeading>
        <p>
          FiloRag is an AI-powered knowledge base platform that allows users to upload video and audio files,
          which are then processed for scene detection, transcription, and semantic embedding. Users can
          subsequently search, query, and interact with their uploaded content through natural-language chat
          interfaces ("the Service"). We may update, modify, or discontinue any part of the Service at any time
          with reasonable notice.
        </p>

        {/* 3 */}
        <SectionHeading>3. User Accounts</SectionHeading>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials. You agree to
          notify us immediately at support@filorag.com if you suspect unauthorised access to your account.
          We reserve the right to terminate accounts that violate these Terms, without prior notice.
        </p>
        <p className="mt-2">
          You may not share your account credentials with third parties, create accounts on behalf of others
          without authorisation, or use automated tools to create multiple accounts.
        </p>

        {/* 4 */}
        <SectionHeading>4. Acceptable Use</SectionHeading>
        <p>You agree <strong style={{ color: '#e2e8f0' }}>not</strong> to:</p>
        <ul className="list-disc list-inside space-y-1 mt-2 pl-2">
          <li>Upload content that infringes third-party intellectual property rights, including copyrighted videos you do not own or have a licence to process.</li>
          <li>Upload material that is illegal, harmful, threatening, harassing, defamatory, or obscene.</li>
          <li>Attempt to reverse-engineer, scrape, or interfere with our infrastructure, APIs, or AI models.</li>
          <li>Use the Service to train competing AI models or to build competitive products that replicate core functionality.</li>
          <li>Circumvent rate limits, access controls, or payment requirements.</li>
          <li>Upload malware, viruses, or any code designed to damage systems or data.</li>
        </ul>

        {/* 5 */}
        <SectionHeading>5. Content Ownership and Licence</SectionHeading>
        <p>
          You retain full ownership of all content you upload to FiloRag ("Your Content"). By uploading content,
          you grant FiloRag a limited, non-exclusive, royalty-free licence to store, process, transcode, index,
          and analyse Your Content solely for the purpose of providing the Service to you. We do not use Your
          Content to train our models or share it with third parties, except as described in our{' '}
          <Link
            to="/privacy"
            style={{ color: '#c084fc', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            Privacy Policy
          </Link>.
        </p>
        <p className="mt-2">
          You are solely responsible for ensuring you have the right to upload and process any content submitted
          to the Service. FiloRag is not liable for content that infringes third-party rights.
        </p>

        {/* 6 */}
        <SectionHeading>6. Subscriptions and Payments</SectionHeading>
        <p>
          Certain features of the Service are available only under a paid subscription plan. Subscription fees are
          billed in advance on a monthly or annual basis depending on the plan selected. All fees are
          non-refundable except as required by applicable Indian law or as stated in our refund policy.
        </p>
        <p className="mt-2">
          We use <strong style={{ color: '#e2e8f0' }}>Razorpay</strong> as our payment gateway partner, which
          is authorised by the Reserve Bank of India (RBI) as a Payment Aggregator under the Payment and
          Settlement Systems Act, 2007. Your payment information — including card details, UPI, netbanking,
          and wallet credentials — is processed directly and securely by Razorpay and is subject to Razorpay's
          terms of service and privacy policy. We do not store your full card number, CVV, or UPI PIN on our
          servers. Transactions are processed in Indian Rupees (INR) by default.
        </p>
        <p className="mt-2">
          We reserve the right to change subscription pricing with 30 days' notice communicated via email
          or in-app notification, in accordance with the Consumer Protection Act, 2019. Continued use of
          the Service after a price change constitutes acceptance of the new pricing. You may cancel your
          subscription at any time; access will remain until the end of the current billing period.
        </p>

        {/* 7 */}
        <SectionHeading>7. Free Plan and Storage Limits</SectionHeading>
        <p>
          Free-tier accounts are subject to storage quotas, processing minutes, and feature restrictions as
          outlined on the Pricing page. We reserve the right to enforce these limits, pause processing for
          accounts that exceed them, or require an upgrade to continue using affected features. We may delete
          content uploaded by inactive free accounts after 90 days of inactivity, with prior email notice.
        </p>

        {/* 8 */}
        <SectionHeading>8. Data Processing and AI</SectionHeading>
        <p>
          The Service processes your uploaded videos through automated pipelines including scene detection,
          audio transcription, and vector embedding. Results are stored in your private collection and used
          to power semantic search and AI chat features. AI-generated answers are provided for convenience
          and may not always be accurate. You are responsible for verifying any AI-generated information
          before acting on it.
        </p>

        {/* 9 */}
        <SectionHeading>9. Intellectual Property</SectionHeading>
        <p>
          All technology, software, algorithms, designs, trademarks, and branding associated with FiloRag
          are the intellectual property of FiloRag and are protected by applicable laws. Nothing in these
          Terms grants you a licence to use our intellectual property beyond what is necessary to use the
          Service as intended.
        </p>

        {/* 10 */}
        <SectionHeading>10. Disclaimers and Limitation of Liability</SectionHeading>
        <p>
          The Service is provided "as is" and "as available" without warranties of any kind, express or
          implied, including but not limited to fitness for a particular purpose, merchantability, or
          non-infringement. We do not guarantee that the Service will be error-free, uninterrupted, or that
          AI outputs will be accurate or complete.
        </p>
        <p className="mt-2">
          To the maximum extent permitted by applicable law, FiloRag shall not be liable for any indirect,
          incidental, special, consequential, or punitive damages arising from your use of or inability to
          use the Service, even if we have been advised of the possibility of such damages. Our total
          aggregate liability shall not exceed the amount you paid us in the 12 months preceding the claim.
        </p>

        {/* 11 */}
        <SectionHeading>11. Indemnification</SectionHeading>
        <p>
          You agree to indemnify and hold harmless FiloRag and its affiliates, officers, employees, and
          agents from and against any claims, liabilities, damages, and expenses (including legal fees)
          arising from your use of the Service, Your Content, or your violation of these Terms.
        </p>

        {/* 12 */}
        <SectionHeading>12. Termination</SectionHeading>
        <p>
          Either party may terminate this agreement at any time. You may delete your account from the
          Settings page. We may suspend or terminate your access if you breach these Terms, without
          liability. Upon termination, we will delete Your Content within 30 days, except where retention
          is required by law or legitimate business purposes such as fraud prevention.
        </p>

        {/* 13 */}
        <SectionHeading>13. Changes to Terms</SectionHeading>
        <p>
          We may update these Terms from time to time. When we do, we will revise the "Last updated" date
          at the top of this page and, for material changes, notify you by email or in-app notification.
          Continued use of the Service after changes become effective constitutes acceptance of the revised
          Terms.
        </p>

        {/* 14 */}
        <SectionHeading>14. Governing Law and Dispute Resolution</SectionHeading>
        <p>
          These Terms are governed by and construed in accordance with the laws of India, including but not
          limited to:
        </p>
        <ul className="list-disc list-inside space-y-1 pl-2 mt-2">
          <li>The <strong style={{ color: '#e2e8f0' }}>Information Technology Act, 2000</strong> and the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</li>
          <li>The <strong style={{ color: '#e2e8f0' }}>Digital Personal Data Protection Act, 2023 (DPDPA)</strong></li>
          <li>The <strong style={{ color: '#e2e8f0' }}>Indian Contract Act, 1872</strong></li>
          <li>The <strong style={{ color: '#e2e8f0' }}>Consumer Protection Act, 2019</strong></li>
          <li>The <strong style={{ color: '#e2e8f0' }}>Copyright Act, 1957</strong></li>
          <li>The <strong style={{ color: '#e2e8f0' }}>Payment and Settlement Systems Act, 2007</strong> (insofar as it relates to payment processing)</li>
        </ul>
        <p className="mt-2">
          Any dispute, claim, or controversy arising out of or relating to these Terms shall first be
          attempted to be resolved through good-faith negotiation. If unresolved within 30 days, disputes
          shall be referred to binding arbitration under the <strong style={{ color: '#e2e8f0' }}>Arbitration
            and Conciliation Act, 1996</strong>, with a sole arbitrator mutually agreed upon by both parties.
          The seat of arbitration shall be Kolkata, West Bengal, India, and proceedings shall be conducted
          in English.
        </p>
        <p className="mt-2">
          Nothing in this clause shall prevent either party from seeking interim or injunctive relief from a
          court of competent jurisdiction. Subject to the arbitration clause above, both parties submit to
          the exclusive jurisdiction of courts in Kolkata, West Bengal.
        </p>

        {/* 15 */}
        <SectionHeading>15. Contact</SectionHeading>
        <p>
          If you have any questions about these Terms, please contact us:{' '}
          <a
            href="mailto:support@filorag.com"
            style={{ color: '#c084fc', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
          >
            support@filorag.com
          </a>
        </p>
      </div>

      {/* Footer */}
      <div
        className="mt-16 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
        style={{ borderTop: '1px solid rgba(168, 85, 247, 0.12)', color: 'rgba(100, 116, 139, 0.7)' }}
      >
        <span>© {new Date().getFullYear()} FiloRag · Built with ♥ by Tridibesh Nag</span>
        <div className="flex items-center gap-4">
          <Link
            to="/privacy"
            style={{ color: 'rgba(148, 163, 184, 0.6)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#a855f7')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(148, 163, 184, 0.6)')}
          >
            Privacy Policy
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

export default TermsPage;
