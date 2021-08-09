// no-op
// just there for syntax highlighting
export default function css(
  strings: TemplateStringsArray,
  ...args: (string | number)[]
) {
  throw new Error(
    '`css` function should not exist during runtime. Check your build config. If everything seems fine, then please open an issue'
  );

  return {} as Record<string, string> & {
    link: (props: React.LinkHTMLAttributes<HTMLLinkElement>) => JSX.Element;
  };
}
