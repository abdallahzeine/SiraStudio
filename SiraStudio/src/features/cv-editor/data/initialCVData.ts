import type { CVData, SectionLayout } from '../../../shared/types';
import { migrateCVData } from '../../../shared/utils/cvContent';

// Classic layout defaults per section type (matches current visual output)
const classicWorkExp: SectionLayout = {
  presetId: 'classic',
  dateSlot: 'right-inline',
  iconStyle: 'bullet',
  separator: 'none',
  density: 'compact',
  columns: 1,
};

const classicDateRight: SectionLayout = {
  presetId: 'classic',
  dateSlot: 'right-inline',
  iconStyle: 'none',
  separator: 'none',
  density: 'compact',
  columns: 1,
};

const classicNoDate: SectionLayout = {
  presetId: 'classic',
  dateSlot: 'hidden',
  iconStyle: 'none',
  separator: 'none',
  density: 'compact',
  columns: 1,
};

const classicProjects: SectionLayout = {
  presetId: 'classic',
  dateSlot: 'hidden',
  iconStyle: 'bullet',
  separator: 'none',
  density: 'relaxed',
  columns: 1,
};

const rawInitialCVData = {
  template: { id: 'single-column', columns: 1 },
  header: {
    name: 'Abdallah Zeine Elabidine',
    location: 'Jeddah, Saudi Arabia',
    phone: '+966566454894',
    email: 'abdallahzeine@gmail.com',
    socialLinks: [
      {
        id: 'link-1',
        url: 'https://github.com/abdallahzeine',
        label: 'GitHub',
        iconType: 'github',
        displayOrder: 0,
      },
      {
        id: 'link-2',
        url: 'https://linkedin.com/in/abdallahzeine',
        label: 'LinkedIn',
        iconType: 'linkedin',
        displayOrder: 1,
      },
      {
        id: 'link-3',
        url: 'https://abdallahzeine.dev',
        label: 'Portfolio',
        iconType: 'portfolio',
        color: '#9333EA',
        displayOrder: 2,
      },
    ],
  },
  sections: [
    {
      id: 'work-exp',
      type: 'work-experience',
      title: 'WORK EXPERIENCE',
      layout: classicWorkExp,
      items: [
        {
          id: 'we-1',
          title: 'AI Engineer Intern',
          subtitle: 'Tech Company',
          location: 'Jeddah, Saudi Arabia',
          date: '06/2024 - 09/2024',
          bullets: [
            'Developed AI-powered features using LangChain and OpenAI APIs.',
            'Built and deployed REST APIs with FastAPI, reducing response time by 30%.',
          ],
        },
      ],
    },
    {
      id: 'summary',
      type: 'summary',
      title: 'PROFESSIONAL SUMMARY',
      layout: classicNoDate,
      items: [
        {
          id: 'summary-1',
          body: 'AI Engineer specializing in Django web development, building AI-powered applications. Committed to solving complex problems, driving innovation, and mastering new technologies.',
        },
      ],
    },
    {
      id: 'education',
      type: 'education',
      title: 'EDUCATION',
      layout: classicDateRight,
      items: [
        {
          id: 'edu-1',
          title: 'Bachelor of Applied Science - BASc Data Sciences & Artificial Intelligence',
          subtitle: 'Al Ahliyya Amman University · GPA: 3.71/4.00',
          date: '10/2022 - Present',
        },
      ],
    },
    {
      id: 'skills',
      type: 'skills',
      title: 'SKILLS',
      layout: classicNoDate,
      items: [
        {
          id: 'skills-1',
          skillGroups: [
            { id: 'sg-1', label: 'Languages & DBMS', value: 'Python, JavaScript, SQL, PostgreSQL, MySQL' },
            { id: 'sg-2', label: 'Frameworks & Libraries', value: 'Django, Langchain, FastAPI, HTMX, Tailwind CSS, PyTorch, TensorFlow, scikit-learn, React' },
            { id: 'sg-3', label: 'DevOps', value: 'External API integrations, Docker, Git, GitHub, Nginx' },
            { id: 'sg-4', label: 'Hobbies', value: 'Photographer, Photo editing' },
          ],
        },
      ],
    },
    {
      id: 'certifications',
      type: 'certifications',
      title: 'CERTIFICATIONS',
      layout: classicDateRight,
      items: [
        {
          id: 'cert-1',
          title: 'IBM AI Engineering Professional',
          subtitle: 'IBM',
          date: '06/2025',
        },
        {
          id: 'cert-2',
          title: 'Meta Back-End Developer',
          subtitle: 'Meta',
          date: '02/2025',
        },
      ],
    },
    {
      id: 'projects',
      type: 'projects',
      title: 'PROJECTS',
      layout: classicProjects,
      items: [
        {
          id: 'proj-1',
          title: 'FinAI – AI-Powered Fintech Assistant',
          bullets: [
            'Built a full-featured AI-powered Personal banker application.',
            'Helps users efficiently manage accounts, discover offers, and make informed decisions.',
            '<strong>Tech:</strong> Django, HTMX, Tailwind CSS, External API integrations (httpx/requests)',
          ],
        },
        {
          id: 'proj-2',
          title: 'Hfawa – Charity Event Scheduling System',
          bullets: [
            'Developed a web system for my FIRST CUSTOMER to streamline event scheduling for new Umrah and Hajj visitors.',
            'Powered by PWA web technology to provide a mobile-friendly experience.',
            '<strong>Tech:</strong> Django, HTMX, Tailwind CSS, PWA, REST API, Nginx, VPS hosting',
          ],
        },
        {
          id: 'proj-3',
          title: 'Django OCR System – AI-Powered Data Extraction',
          bullets: [
            'Built a structured data extraction system for invoices and quotations using the Gemini API.',
            'Leveraged LangChain and advanced prompt engineering to accurately extract product lists and save structured quotes.',
            'Containerized and deployed the application using Docker for sharing APP with others.',
            '<strong>Tech:</strong> Django, LangChain, Gemini API, Docker, Prompt Engineering',
          ],
        },
        {
          id: 'proj-4',
          title: 'OCR Deep Learning Model',
          bullets: [
            'Designed and implemented a custom OCR architecture in PyTorch, with advanced optimization techniques to improve recognition performance.',
            'Achieved 93% accuracy on real-world tests with 1,000+ images, successfully solving complex CAPTCHA designs.',
            '<strong>Tech:</strong> PyTorch, Tkinter, Python',
          ],
        },
      ],
    },
    {
      id: 'awards',
      type: 'awards',
      title: 'AWARDS & SCHOLARSHIPS',
      layout: classicDateRight,
      items: [
        {
          id: 'award-1',
          title: '3rd Place in Fintech Rally: University Edition',
          subtitle: 'JOPAC & JOIN Fincubator',
          date: '07/2025',
        },
        {
          id: 'award-2',
          title: 'Local Programming Contest',
          subtitle: 'Al Ahliyya Amman University',
          date: '11/2023',
        },
      ],
    },
    {
      id: 'volunteering',
      type: 'volunteering',
      title: 'VOLUNTEERING & LEADERSHIP',
      layout: classicDateRight,
      items: [
        {
          id: 'vol-1',
          title: 'IEEE CS Chapter - AAU Club',
          role: 'Event Coordinator',
          date: '03/2025 - Present',
        },
        {
          id: 'vol-2',
          title: 'Data Science & AI - AAU Club',
          role: 'Course Manager',
          date: '10/2024 - 06/2025',
        },
      ],
    },
  ],
};

export const initialCVData: CVData = migrateCVData(rawInitialCVData);
