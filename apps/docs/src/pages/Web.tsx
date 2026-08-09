import content from '../../../../packages/ui/README.md?raw';
import { MarkdownPage } from '../components/MarkdownPage';

export function Web() {
  return <MarkdownPage content={content} />;
}
