export interface HelpDeskNode {
  id: string;
  title: string;
  content?: string;
  children?: HelpDeskNode[];
}

export const STAFF_HELP_DESK_TREE: HelpDeskNode[] = [
  {
    id: 'checkin',
    title: 'Check-In & Check-Out',
    children: [
      { id: 'checkin-time', title: 'Check-in', content: '3:00 PM' },
      { id: 'checkout-time', title: 'Check-out', content: '11:00 AM' },
      { id: 'late-checkout', title: 'Late check-out', content: 'Until 1:00 PM ($50 fee)' },
    ],
  },
  {
    id: 'amenities',
    title: 'Amenities',
    children: [
      {
        id: 'pool',
        title: 'Pool',
        children: [
          { id: 'pool-floor', title: 'Location', content: '3rd floor' },
          { id: 'pool-hours', title: 'Hours', content: '6:00 AM - 10:00 PM' },
        ],
      },
      {
        id: 'fitness',
        title: 'Fitness Center',
        children: [
          { id: 'fitness-hours', title: 'Hours', content: 'Open 24/7 (room key access)' },
        ],
      },
      {
        id: 'spa',
        title: 'Spa Services',
        children: [
          {
            id: 'spa-booking',
            title: 'Booking',
            content: 'In-room massages by appointment, minimum 2 hours notice.',
          },
        ],
      },
    ],
  },
  {
    id: 'dining',
    title: 'Dining',
    children: [
      {
        id: 'celestial',
        title: 'The Celestial Dining Room',
        content: 'Open 6:30 AM - 10:30 PM. Breakfast buffet until 10:30 AM.',
      },
      { id: 'zenith', title: 'The Zenith Lounge', content: 'Open 4:00 PM - 1:00 AM.' },
      { id: 'room-service', title: 'Room Service', content: 'Available 24/7. Dial 0.' },
    ],
  },
  {
    id: 'parking',
    title: 'Parking',
    children: [
      {
        id: 'self-parking',
        title: 'Self-parking',
        content: '$25/night. Underground garage - Level B1.',
      },
      {
        id: 'valet-parking',
        title: 'Valet parking',
        content: '$40/night. Main entrance.',
      },
    ],
  },
  {
    id: 'pets',
    title: 'Pet Policy',
    content: 'Dogs and cats up to 40 lbs welcome. $30 daily fee. Beds and bowls available.',
  },
  {
    id: 'services',
    title: 'Services',
    children: [
      { id: 'laundry', title: 'Laundry & Dry Cleaning', content: 'Same-day. Drop before 9:00 AM.' },
      { id: 'housekeeping', title: 'Housekeeping', content: 'Daily service between 9:00 AM - 4:00 PM.' },
    ],
  },
];

