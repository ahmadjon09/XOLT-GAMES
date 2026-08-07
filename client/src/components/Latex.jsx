import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function Latex({ math, block = true, className = '' }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math || '', { throwOnError: false, displayMode: block });
    } catch (e) {
      return math || '';
    }
  }, [math, block]);

  if (block) {
    return <div className={`latex-question ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
