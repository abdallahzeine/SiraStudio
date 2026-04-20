<div align="center">

![SiraStudio Logo](./public/Logo.png)

# CV Maker

**Create, customize, and export professional CVs with ease**

[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.2-blue?logo=tailwindcss)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-8.0-blue?logo=vite)](https://vitejs.dev/)

</div>

## 📋 About

CV Maker is a modern, interactive web application built with **React** and **TypeScript** that allows you to create, edit, and export professional curriculum vitae (CVs) with multiple layout options and customizable templates.

## ✨ Features

- 🎨 **Multiple Templates** - Choose from various professional CV layouts
- 📝 **Interactive Editor** - Edit your CV in real-time with instant preview
- 🎯 **Customizable Sections** - Add, remove, or reorder sections (Education, Experience, Skills, Projects, etc.)
- 🖼️ **Multiple Presets** - Classic and Professional design presets
- 📊 **Layout Customization** - Control density, spacing, columns, and date placement
- 💾 **Local Storage** - Auto-save your CV data locally
- 🖨️ **Print to PDF** - Export your CV as PDF with proper formatting
- 📱 **Responsive Design** - Works seamlessly on desktop and tablet devices
- 🔄 **Drag & Drop** - Reorder sections and items with ease using dnd-kit

## 🚀 Quick Start

### Prerequisites

- **Node.js** 16+ 
- **npm** or **yarn**

### Installation

```bash
# Clone the repository
git clone https://github.com/abdallahzeine/cv-maker.git
cd cv-maker

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

## 📦 Available Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload

# Production
npm run build            # Build for production
npm run preview          # Preview production build locally

# Code Quality
npm run lint             # Run ESLint
```

## 🏗️ Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| **React** | 19.2 | UI Framework |
| **TypeScript** | 5.9 | Type Safety |
| **Vite** | 8.0 | Build Tool |
| **Tailwind CSS** | 4.2 | Styling |
| **TipTap** | 3.22 | Rich Text Editor |
| **dnd-kit** | 6.3+ | Drag & Drop |

## 📁 Project Structure

```
cv-maker/
├── src/
│   ├── components/       # React components
│   ├── layouts/          # Layout components
│   ├── sections/         # CV section definitions
│   ├── templates/        # CV template designs
│   ├── presets/          # Design presets (classic, professional)
│   ├── data/             # Initial CV data
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── engine/           # Core CV rendering engine
│   ├── store/            # State management
│   └── main.tsx          # Entry point
├── public/               # Static assets
├── vite.config.ts        # Vite configuration
└── package.json          # Dependencies
```

## 📖 Usage

1. **Load or Create** - Start with a template or load existing CV data
2. **Edit** - Modify any section in the editor panel
3. **Preview** - See changes in real-time in the preview panel
4. **Customize** - Adjust layouts, colors, and formatting
5. **Export** - Print to PDF or save as JSON

## 🎨 Customization

### Available Layouts
- **Single Column** - Clean, traditional CV format
- **Sidebar** - Two-column layout with sidebar

### Design Presets
- **Classic** - Elegant, professional look
- **Professional** - Modern, minimalist design

## 📝 License

This project is part of the CV Maker initiative. All rights reserved.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to improve the application.

## 👨‍💻 Author

**Abdallah Zeine Elabidine**
- 📧 Email: abdallahzeine@gmail.com
- 📱 Phone: +966 566 454 894
- 📍 Location: Jeddah, Saudi Arabia
- 🔗 GitHub: [@abdallahzeine](https://github.com/abdallahzeine)

---

<div align="center">

**Made with ❤️ for creating beautiful CVs**

[Report Issues](https://github.com/abdallahzeine/cv-maker/issues) • [Request Features](https://github.com/abdallahzeine/cv-maker/issues)

</div>
