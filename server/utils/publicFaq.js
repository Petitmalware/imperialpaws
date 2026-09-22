// Used by both the visible FAQ page and its search-engine structured data.
module.exports = [
  {
    id: 'choosing', title: 'Finding your companion',
    items: [
      { question: 'Where can I see available puppies?', answer: 'Our puppy listings show photos, personality notes, breed details, and current availability. Open a profile to get to know a puppy before applying.', link: { href: '/puppies', label: 'Meet our puppies' } },
      { question: 'Can I ask about a particular puppy?', answer: 'Of course. Tell us the puppy’s name and what you would like to know. We can discuss their personality, available records, and whether they may be a good fit for your home.', link: { href: '/contact', label: 'Get in touch' } },
      { question: 'What does “Reserved” mean?', answer: 'A placement is being arranged for that puppy, so the listing is not accepting new applications. You can browse the puppies marked Available or contact us with a question.' }
    ]
  },
  {
    id: 'applying', title: 'Your application',
    items: [
      { question: 'How do I apply?', answer: 'Choose an available puppy, open their profile, and select Apply to Adopt. Share your contact details and a little about your home so we can get to know you.', link: { href: '/adoption-process', label: 'See the adoption guide' } },
      { question: 'What happens after I submit my application?', answer: 'You will see a confirmation page with your private tracking code. Save that code to check your application status. We will review your information and may contact you with a few follow-up questions.' },
      { question: 'Does applying reserve a puppy?', answer: 'An application starts a conversation. It does not guarantee approval or reserve a puppy. Placement decisions follow a review of the family and the puppy’s needs.' },
      { question: 'How can I check my progress?', answer: 'Enter your private tracking code on the My application page to see your current status. Keep the code somewhere safe so you can return whenever you need an update.', link: { href: '/track', label: 'My application' } },
      { question: 'Can I correct something in my application?', answer: 'Contact us with your tracking code and the detail you would like to update. If you have already applied for a puppy, there is no need to submit the same application again.', link: { href: '/contact', label: 'Contact us' } }
    ]
  },
  {
    id: 'homecoming', title: 'Getting ready for home',
    items: [
      { question: 'How are pickup or delivery arranged?', answer: 'We discuss the options, location, and timing with approved families. Available arrangements depend on the puppy and your circumstances, and the details are confirmed together.' },
      { question: 'Where can I review health and registration information?', answer: 'Check the puppy’s profile for available veterinary, vaccination, and registration details. Ask us about their records and review the health terms in your adoption agreement before finalizing the placement.' },
      { question: 'Who can I contact with another question?', answer: 'Visit our contact page for current contact details. Include the puppy’s name, or your tracking code if you have already applied, so we can help with your next step.', link: { href: '/contact', label: 'Let’s talk' } }
    ]
  }
];
