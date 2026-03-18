// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import { MarkdownBody } from "./MarkdownBody";

describe("MarkdownBody", () => {
  it("renders markdown images without a resolver", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <MarkdownBody>{"![](/api/attachments/test/content)"}</MarkdownBody>
      </ThemeProvider>,
    );

    expect(html).toContain('<img src="/api/attachments/test/content" alt=""/>');
  });

  it("resolves relative image paths when a resolver is provided", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <MarkdownBody resolveImageSrc={(src) => `/resolved/${src}`}>
          {"![Org chart](images/org-chart.png)"}
        </MarkdownBody>
      </ThemeProvider>,
    );

    expect(html).toContain('src="/resolved/images/org-chart.png"');
    expect(html).toContain('alt="Org chart"');
  });

  it("renders structured mention links with a company prefix", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/PAP/conversations/conversation-1"]}>
        <ThemeProvider>
          <MarkdownBody mentionMode="structured">
            {"See [@Goal](goal://goal-1), [@Issue](issue://issue-1), and [@Agent](agent://agent-1)."}
          </MarkdownBody>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(html).toContain('href="/PAP/goals/goal-1"');
    expect(html).toContain('href="/PAP/issues/issue-1"');
    expect(html).toContain('href="/PAP/agents/agent-1"');
  });

  it("renders project structured mentions without a router context", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <MarkdownBody mentionMode="structured">
          {"See [@Project](project://project-1)."}
        </MarkdownBody>
      </ThemeProvider>,
    );

    expect(html).toContain('href="/projects/project-1"');
    expect(html).toContain("paperclip-project-mention-chip");
  });
});
