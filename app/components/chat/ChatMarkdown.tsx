'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-xl font-bold text-white">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-lg font-bold text-white">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-3 text-base font-semibold text-slate-100">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 text-gray-300">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) return <code className="text-xs">{children}</code>;
    return (
      <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-purple-400">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-gray-800/80 p-3 font-mono text-xs">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-800/50">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-gray-700 px-3 py-2 text-left text-xs font-semibold uppercase text-purple-400">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-gray-800/50 px-3 py-1.5 text-gray-300">
      {children}
    </td>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 list-inside list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-inside list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="text-gray-300">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-purple-400 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-purple-500 pl-3 italic text-gray-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-700" />,
};

export default function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}
