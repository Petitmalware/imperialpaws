const MERGE_FIELDS = Object.freeze([
  { key: 'buyer_name', label: 'Adopting parent name' },
  { key: 'puppy_name', label: 'Puppy name' },
  { key: 'breed', label: 'Puppy breed' },
  { key: 'breeder_name', label: 'Breeder name' },
  { key: 'application_code', label: 'Application reference' },
  { key: 'portal_url', label: 'Application tracking link' },
  { key: 'invoice_number', label: 'Invoice number' },
  { key: 'invoice_total', label: 'Invoice total' },
  { key: 'balance_due', label: 'Invoice balance due' },
  { key: 'payment_details', label: 'Payment instructions' },
  { key: 'delivery_details', label: 'Collection or delivery details' }
].map(Object.freeze));

const DEFAULT_TEMPLATES = Object.freeze([
  {
    id: 'welcome',
    label: 'Welcome & application received',
    description: 'Acknowledge the application and invite any details the family wants to share.',
    subject: 'Your adoption application for {{puppy_name}}',
    body: `Thank you for your interest in {{puppy_name}} and for taking the time to tell me about your home. Choosing a puppy is a personal decision, and I appreciate the thought you are putting into it.

I am reviewing your application and will email you about the next step. If there is anything else you would like me to know about your household, experience with dogs, or plans for {{puppy_name}}, you can reply here.

Your application reference is {{application_code}}. You can also check its progress here: {{portal_url}}`
  },
  {
    id: 'approved',
    label: 'Application approved & next steps',
    description: 'Explain what happens after approval and collect the details needed for the paperwork.',
    requires: ['approved'],
    subject: 'Next steps for adopting {{puppy_name}}',
    body: `I am pleased to let you know that your application to adopt {{puppy_name}} has been approved. Thank you for sharing a little about the home you would like to offer.

The next step is to prepare your adoption agreement and invoice. Please confirm the full name and address you would like on the paperwork, along with whether you would prefer collection or delivery.

We can agree the arrangements and any related costs in writing before you make a payment. If you have questions about the adoption, please reply here so we can work through them together.`
  },
  {
    id: 'documents',
    label: 'Agreement, invoice & payment next step',
    description: 'Send both PDF documents together, with the invoice details and your payment instructions.',
    requires: ['approved', 'invoice', 'contract'],
    subject: 'Your adoption agreement and invoice for {{puppy_name}}',
    body: `Thank you for working through the details with me. Attached are your adoption agreement and invoice for {{puppy_name}}.

Invoice reference: {{invoice_number}}
Invoice total: {{invoice_total}}
Balance due: {{balance_due}}

Please read both documents and check that your details and the agreed arrangements are correct before making a payment. Reply with any questions or corrections, and return the signed agreement when you are comfortable with its terms.

If a balance remains, these are the payment instructions:
{{payment_details}}

Please let me know once you have made the payment. I will confirm by email when it has been received, and we can complete the collection or delivery arrangements for {{puppy_name}}.`
  },
  {
    id: 'follow_up',
    label: 'Friendly follow-up',
    description: 'Check in without pressure and make it easy for the family to ask a question or pause.',
    subject: 'Checking in about {{puppy_name}}',
    body: `I wanted to check in about your interest in {{puppy_name}}. I know bringing a puppy home takes some thought, so please take the time you need.

Is there anything about the adoption process or the next step that you would like me to explain? You can reply to this email and I will help with the details.

If your plans have changed, that is absolutely fine too. Just let me know so I can keep your application up to date.`
  },
  {
    id: 'payment_received',
    label: 'Payment received',
    description: 'Confirm a recorded, fully paid invoice and move on to collection or delivery planning.',
    requires: ['paid_invoice'],
    subject: 'Payment received for {{puppy_name}}',
    body: `Thank you for your payment for {{puppy_name}}. Invoice {{invoice_number}}, totaling {{invoice_total}}, is now marked as paid, with a remaining balance of {{balance_due}}.

I appreciate you keeping in touch as we work through the adoption. Our next step is to confirm the collection or delivery arrangements together.

Please reply if anything has changed with your address or availability. I will send the confirmed arrangements in writing so you have the details to hand.`
  },
  {
    id: 'delivery_planning',
    label: 'Plan collection or delivery',
    description: 'Share proposed arrangements and ask the family to confirm them.',
    requires: ['approved'],
    subject: 'Planning {{puppy_name}}\'s journey home',
    body: `We are at the stage of planning how {{puppy_name}} will come home to you. Here are the proposed collection or delivery details for you to review:

{{delivery_details}}

Please check the date, location, and contact details, and reply to confirm whether these arrangements work for you. Let me know if anything needs adjusting before we finalize them.

I am looking forward to helping you prepare for {{puppy_name}}\'s arrival. If you have any practical questions about the handover, please include them in your reply.`
  },
  {
    id: 'delivery_update',
    label: 'Collection or delivery update',
    description: 'Send the actual agreed timing, address, and transport details entered for this family.',
    requires: ['approved', 'delivery_details'],
    subject: 'Collection or delivery update for {{puppy_name}}',
    body: `Here is the latest collection or delivery update for {{puppy_name}}:

{{delivery_details}}

Please keep these details handy and reply to confirm you have received them. If your availability or contact details change, let me know so we can update the arrangements together.

Thank you for staying in touch throughout the adoption. Please let me know when {{puppy_name}} is safely home with you.`
  },
  {
    id: 'welcome_home',
    label: 'Welcome home & settling in',
    description: 'Follow up after a completed handover and invite a simple update about settling in.',
    requires: ['completed'],
    subject: 'How is {{puppy_name}} settling in?',
    body: `Now that {{puppy_name}} is home with you, I wanted to check in and see how you are both settling into your new routine.

Those first days can bring plenty of questions. Please reply if there is anything about the handover or the information we discussed that you would like me to clarify.

Thank you for welcoming {{puppy_name}} into your family. I would be glad to hear how things are going when you have a moment.`
  }
].map(template => Object.freeze({
  ...template,
  ...(template.requires ? { requires: Object.freeze([...template.requires]) } : {})
})));

function validOverride(value, limit) {
  return typeof value === 'string' && value.trim() && value.trim().length <= limit;
}

function resolveTemplates(settings = {}) {
  const saved = settings && settings.replyTemplates;
  const overrides = Array.isArray(saved)
    ? Object.fromEntries(saved.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]))
    : saved && typeof saved === 'object' ? saved : {};

  return DEFAULT_TEMPLATES.map(template => {
    const override = Object.prototype.hasOwnProperty.call(overrides, template.id) ? overrides[template.id] : null;
    return {
      ...template,
      ...(template.requires ? { requires: [...template.requires] } : {}),
      subject: validOverride(override && override.subject, 160) ? override.subject.trim() : template.subject,
      body: validOverride(override && override.body, 5000) ? override.body.trim() : template.body
    };
  });
}

function replaceFields(text, values) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (token, key) => {
    if (!values || !Object.prototype.hasOwnProperty.call(values, key)) return token;
    const value = values[key];
    if (typeof value === 'string') return value.trim() ? value : token;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return String(value);
    return token;
  });
}

function renderTemplate(template, values = {}) {
  return {
    ...template,
    ...(template.requires ? { requires: [...template.requires] } : {}),
    subject: replaceFields(template.subject, values),
    body: replaceFields(template.body, values)
  };
}

function unresolvedFields(subject, body) {
  const tokens = `${subject || ''}\n${body || ''}`.match(/\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}/g) || [];
  return [...new Set(tokens)];
}

module.exports = { DEFAULT_TEMPLATES, MERGE_FIELDS, resolveTemplates, renderTemplate, unresolvedFields };
