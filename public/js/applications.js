document.querySelectorAll('[data-reply-form]').forEach(form => {
  const select = form.querySelector('[data-reply-template]');
  const message = form.elements.messageBody;
  const name = form.dataset.familyName || 'there';
  const puppy = form.dataset.puppyName || 'your selected puppy';
  const replies = {
    review: `Hi ${name},\n\nThank you for applying for ${puppy}! I’m looking forward to learning more about your family and the home you can offer. I’ll review your application and get back to you with the next steps.\n\nIf you have any questions in the meantime, please reply here.`,
    questions: `Hi ${name},\n\nThank you for your interest in ${puppy}. Before we move forward, I’d love to learn a little more:\n\n• What would a typical day look like for your puppy?\n• Do you have any other pets at home?\n• What timing are you hoping for?\n\nFeel free to share any questions you have for me, too.`,
    call: `Hi ${name},\n\nI’d love to arrange a conversation about ${puppy} and answer your questions. What days and times work well for you? Please include your time zone and the best number to reach you.\n\nLooking forward to speaking with you!`,
    pickup: `Hi ${name},\n\nLet’s discuss the arrangements for bringing ${puppy} home. Please let me know your preferred dates and whether you’re considering pickup or need to discuss transport options.\n\nWe’ll confirm the details together before making any final arrangements.`
  };
  select.addEventListener('change', () => {
    if (!replies[select.value]) return;
    if (message.value.trim() && !window.confirm('Replace the message below with this suggested reply?')) { select.value = ''; return; }
    message.value = replies[select.value];
    message.focus();
  });
});
