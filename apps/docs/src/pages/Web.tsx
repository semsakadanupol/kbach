import content from '../../../../packages/react/README.md?raw';
import { MarkdownPage } from '../components/MarkdownPage';

export function Web() {
  return <MarkdownPage content={content} />;
}
