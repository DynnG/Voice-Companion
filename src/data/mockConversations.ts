import { Conversation } from '../types/conversation';

export const initialMockConversations: Conversation[] = [
  {
    id: 'conv-active-1',
    title: 'Interview - Software Developer',
    category: 'Today',
    createdAt: '2026-09-25T08:30:00Z',
    updatedAt: '2026-09-25T08:35:00Z',
    status: 'active',
    jobRole: 'Software Developer',
    attachedDocuments: [
      {
        id: 'doc-1',
        name: 'Alex_Developer_Resume.pdf',
        category: 'resume',
        size: '1.2 MB',
        uploadedAt: '08:29 AM'
      },
      {
        id: 'doc-2',
        name: 'Senior_Software_Developer_JD.pdf',
        category: 'job_description',
        size: '480 KB',
        uploadedAt: '08:30 AM'
      }
    ],
    isReadOnly: false,
    messages: [
      {
        id: 'm-1',
        sender: 'Pal',
        text: "Welcome to your mock interview for Software Developer! I've reviewed your resume and the job description. Let's start with your recent React projects.",
        timestamp: '08:30 AM'
      },
      {
        id: 'm-2',
        sender: 'You',
        text: 'I recently built a real-time voice companion interface with React state management and canvas animations.',
        timestamp: '08:31 AM'
      },
      {
        id: 'm-3',
        sender: 'Pal',
        text: "That sounds impressive! How did you optimize the 60fps canvas rendering loop while preserving component responsiveness?",
        timestamp: '08:32 AM'
      }
    ]
  },
  {
    id: 'conv-today-2',
    title: 'Interview - Senior Product Manager',
    category: 'Today',
    createdAt: '2026-09-25T07:10:00Z',
    updatedAt: '2026-09-25T07:20:00Z',
    status: 'completed',
    jobRole: 'Senior Product Manager',
    attachedDocuments: [
      {
        id: 'doc-3',
        name: 'PM_Resume_2026.pdf',
        category: 'resume',
        size: '950 KB',
        uploadedAt: '07:08 AM'
      },
      {
        id: 'doc-4',
        name: 'Product_Portfolio_Highlights.pdf',
        category: 'portfolio',
        size: '2.4 MB',
        uploadedAt: '07:09 AM'
      }
    ],
    isReadOnly: true,
    messages: [
      {
        id: 'm-10',
        sender: 'You',
        text: 'How do you prioritize features when dealing with competing engineering and design constraints?',
        timestamp: '07:10 AM'
      },
      {
        id: 'm-11',
        sender: 'Pal',
        text: 'Sure thing. Let me walk you through it. I balance user impact, technical feasibility, and business urgency using RICE scoring.',
        timestamp: '07:11 AM'
      }
    ]
  },
  {
    id: 'conv-yest-1',
    title: 'Interview - AI Systems Engineer',
    category: 'Yesterday',
    createdAt: '2026-09-24T16:00:00Z',
    updatedAt: '2026-09-24T16:15:00Z',
    status: 'completed',
    jobRole: 'AI Systems Engineer',
    attachedDocuments: [
      {
        id: 'doc-5',
        name: 'AI_Systems_CV.pdf',
        category: 'resume',
        size: '1.8 MB',
        uploadedAt: '03:55 PM'
      }
    ],
    isReadOnly: true,
    messages: [
      {
        id: 'm-20',
        sender: 'You',
        text: 'Can you explain your experience with LLM streaming APIs and audio buffer pipelines?',
        timestamp: '04:00 PM'
      },
      {
        id: 'm-21',
        sender: 'Pal',
        text: 'I implemented chunked WebSocket streaming with Web Audio API context synchronization for sub-200ms latency.',
        timestamp: '04:01 PM'
      }
    ]
  },
  {
    id: 'conv-older-1',
    title: 'Interview - UX Designer',
    category: 'Older',
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-09-10T09:05:00Z',
    status: 'completed',
    jobRole: 'UX Designer',
    attachedDocuments: [],
    isReadOnly: true,
    messages: [
      {
        id: 'm-50',
        sender: 'You',
        text: 'Hello Pal, ready for my UX design interview setup.',
        timestamp: '09:00 AM'
      },
      {
        id: 'm-51',
        sender: 'Pal',
        text: 'Hello! I am Pal, your AI voice interviewer. Let’s explore your design process.',
        timestamp: '09:01 AM'
      }
    ]
  }
];
