import content from '../../../../packages/native/kbach-native.md?raw';
import { MarkdownPage } from '../components/MarkdownPage';

export function ReferenceNative() {
  return <MarkdownPage content={content} />;
}
