import content from '../../../../packages/native/README.md?raw';
import { MarkdownPage } from '../components/MarkdownPage';

export function Native() {
  return <MarkdownPage content={content} />;
}
