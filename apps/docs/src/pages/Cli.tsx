import content from '../../../../packages/create-kbach/README.md?raw';
import { MarkdownPage } from '../components/MarkdownPage';

export function Cli() {
  return <MarkdownPage content={content} />;
}
