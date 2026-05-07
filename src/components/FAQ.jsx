import { useState } from 'react'
import './FAQ.css'

const FAQS = [
  {
    section: 'Getting started',
    items: [
      { q: 'How do I import transactions?', a: 'Go to the Import tab, then upload a CSV or Excel file from your bank. bump. will automatically categorise each transaction. Most South African banks let you export statements from their online portal or app.' },
      { q: 'Which banks are supported?', a: 'bump. works with any bank that lets you export a CSV or Excel statement — FNB, Nedbank, ABSA, Capitec, Standard Bank, Discovery Bank, and TymeBank are all supported. The parser handles different column formats automatically.' },
      { q: 'Can I add transactions manually?', a: 'Yes — go to the Add Spend tab and type in plain English, like "Woolies R340" or "Uber Eats R180 last night". bump. will parse it and ask you to confirm before saving.' },
    ]
  },
  {
    section: 'Plans and billing',
    items: [
      { q: 'What does the free plan include?', a: 'The free plan gives you 30 days of transaction history, the overview tab, and 10 AI analysis questions per month. It is a good way to try bump. before upgrading.' },
      { q: 'What does Budget Coach unlock?', a: 'Budget Coach (R99/mo) unlocks your full 12-month transaction history, the analytics tab, projections, grocery comparison, budget recommendations, and unlimited AI insights.' },
      { q: 'How do I upgrade my plan?', a: 'Tap your profile icon in the top right, then go to My Profile. Subscription management is handled through Paystack. If you have trouble, contact support.' },
      { q: 'Can I cancel at any time?', a: 'Yes. You can cancel your subscription at any time through the billing portal. Your access continues until the end of the paid period.' },
    ]
  },
  {
    section: 'AI and analysis',
    items: [
      { q: 'How does the AI analysis work?', a: 'bump. sends a summary of your categorised transactions to Claude (by Anthropic) and receives a plain-text analysis back. Your raw transaction names are included so the AI can be specific, but no personal identifiers are shared beyond what is in your transaction data.' },
      { q: 'Why does the AI have a monthly limit?', a: 'Each AI call costs money to run. Free plan users get 10 calls per month, which covers basic monthly check-ins. Budget Coach and above get 500 calls per month, which is effectively unlimited for normal use.' },
      { q: 'Can I ask the AI specific questions?', a: 'Yes — when you run an analysis, there is an optional field to ask a specific question like "why am I overspending on food?" or "how long until I can save R50,000?". The AI will address your question directly.' },
    ]
  },
  {
    section: 'Privacy and data',
    items: [
      { q: 'Who can see my transactions?', a: 'Only you. bump. does not sell your data. If you book a Pro consultation, you can optionally grant your consultant temporary read access — you control this and can revoke it at any time.' },
      { q: 'Is my data secure?', a: 'Transaction data is stored in Supabase (hosted on AWS) with row-level security — each user can only read their own rows. All API calls use HTTPS and authenticated tokens.' },
      { q: 'Can I delete my data?', a: 'Yes. Contact support and we will delete your account and all associated transaction data. We do not retain backups of deleted accounts beyond 30 days.' },
    ]
  },
]

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="faq-item">
      <button className="faq-q" onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <span className={`faq-chevron ${open ? 'open' : ''}`}>▼</span>
      </button>
      {open && <div className="faq-a">{a}</div>}
    </div>
  )
}

export default function FAQ() {
  return (
    <div className="faq-shell">
      <h2 className="faq-title">FAQs</h2>
      <p className="faq-sub">Common questions about bump.</p>
      {FAQS.map(section => (
        <div key={section.section}>
          <div className="faq-section-head">{section.section}</div>
          {section.items.map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
        </div>
      ))}
    </div>
  )
}
