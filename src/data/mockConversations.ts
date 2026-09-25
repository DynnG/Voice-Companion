import { Conversation } from '../types/conversation';

export const initialMockConversations: Conversation[] = [
  {
    id: 'conv-active-1',
    title: 'Morning Voice Check-in & Daily Schedule',
    category: 'Today',
    createdAt: '2026-09-25T08:30:00Z',
    updatedAt: '2026-09-25T08:35:00Z',
    isReadOnly: false,
    messages: [
      {
        id: 'm-1',
        sender: 'You',
        text: 'Good morning Pal, what does my schedule look like today?',
        timestamp: '08:30 AM'
      },
      {
        id: 'm-2',
        sender: 'Pal',
        text: "Good morning! You have a design sync at 10:00 AM, followed by a team catch-up at 2:00 PM. Would you like me to set reminders?",
        timestamp: '08:30 AM'
      },
      {
        id: 'm-3',
        sender: 'You',
        text: 'Yes please, set a reminder 15 minutes before each.',
        timestamp: '08:31 AM'
      },
      {
        id: 'm-4',
        sender: 'Pal',
        text: "Got it — here's what I found for you. Reminders set for 9:45 AM and 1:45 PM.",
        timestamp: '08:31 AM'
      }
    ]
  },
  {
    id: 'conv-today-2',
    title: 'Voice UI Prototype Architecture',
    category: 'Today',
    createdAt: '2026-09-25T07:10:00Z',
    updatedAt: '2026-09-25T07:20:00Z',
    isReadOnly: true,
    messages: [
      {
        id: 'm-10',
        sender: 'You',
        text: 'How should we isolate the canvas creature from the dashboard shell?',
        timestamp: '07:10 AM'
      },
      {
        id: 'm-11',
        sender: 'Pal',
        text: 'Sure thing. Let me walk you through it. We encapsulate the Canvas rendering in a dedicated VoiceCreature React component while using an AppShell layout wrapper for dashboard navigation.',
        timestamp: '07:11 AM'
      },
      {
        id: 'm-12',
        sender: 'You',
        text: 'That sounds very modular. What about responsive sidebar behavior?',
        timestamp: '07:12 AM'
      },
      {
        id: 'm-13',
        sender: 'Pal',
        text: 'That\'s a good question. Here\'s the short answer: On desktop we use flex layout with collapsible sidebar, and on mobile we render overlay drawers.',
        timestamp: '07:13 AM'
      }
    ]
  },
  {
    id: 'conv-yest-1',
    title: 'React State Machine & Blob Animations',
    category: 'Yesterday',
    createdAt: '2026-09-24T16:00:00Z',
    updatedAt: '2026-09-24T16:15:00Z',
    isReadOnly: true,
    messages: [
      {
        id: 'm-20',
        sender: 'You',
        text: 'Can you explain how the organic blob animation interpolates parameters?',
        timestamp: '04:00 PM'
      },
      {
        id: 'm-21',
        sender: 'Pal',
        text: 'The creature uses linear interpolation (lerp) on amplitude, speed, lobes, and color values toward state targets inside a requestAnimationFrame loop.',
        timestamp: '04:01 PM'
      }
    ]
  },
  {
    id: 'conv-yest-2',
    title: 'Weekly Meal Planning & Grocery List',
    category: 'Yesterday',
    createdAt: '2026-09-24T11:20:00Z',
    updatedAt: '2026-09-24T11:25:00Z',
    isReadOnly: true,
    messages: [
      {
        id: 'm-30',
        sender: 'You',
        text: 'Suggest three quick vegetarian dinner recipes for this week.',
        timestamp: '11:20 AM'
      },
      {
        id: 'm-31',
        sender: 'Pal',
        text: "Here are three options: 1. Creamy Spinach Tuscan Pasta, 2. Sweet Potato & Chickpea Curry, 3. Grilled Mediterranean Veggie Wraps.",
        timestamp: '11:21 AM'
      }
    ]
  },
  {
    id: 'conv-7days-1',
    title: 'Voice Assistant Ambient Lighting Research',
    category: 'Previous 7 Days',
    createdAt: '2026-09-20T14:45:00Z',
    updatedAt: '2026-09-20T15:00:00Z',
    isReadOnly: true,
    messages: [
      {
        id: 'm-40',
        sender: 'You',
        text: 'What color glows represent different voice assistant states best?',
        timestamp: '02:45 PM'
      },
      {
        id: 'm-41',
        sender: 'Pal',
        text: 'Teal for listening brings calm attention, purple/violet for thinking conveys depth, and warm amber for speaking feels human and clear.',
        timestamp: '02:46 PM'
      }
    ]
  },
  {
    id: 'conv-older-1',
    title: 'Initial Pal Voice Setup & Greetings',
    category: 'Older',
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-09-10T09:05:00Z',
    isReadOnly: true,
    messages: [
      {
        id: 'm-50',
        sender: 'You',
        text: 'Hello Pal!',
        timestamp: '09:00 AM'
      },
      {
        id: 'm-51',
        sender: 'Pal',
        text: 'Hello! I am Pal, your voice companion. Tap to talk whenever you need me.',
        timestamp: '09:01 AM'
      }
    ]
  }
];
