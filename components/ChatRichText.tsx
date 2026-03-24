import { Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type ChatRichTextProps = {
  text: string;
  color: string;
};

type InlineSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
};

function parseInlineSegments(input: string) {
  const segments: InlineSegment[] = [];
  let bold = false;
  let italic = false;
  let buffer = "";

  const flushBuffer = () => {
    if (!buffer) {
      return;
    }

    segments.push({
      bold,
      italic,
      text: buffer,
    });
    buffer = "";
  };

  for (let index = 0; index < input.length; ) {
    if (input.startsWith("**", index)) {
      flushBuffer();
      bold = !bold;
      index += 2;
      continue;
    }

    if (input[index] === "*") {
      flushBuffer();
      italic = !italic;
      index += 1;
      continue;
    }

    buffer += input[index];
    index += 1;
  }

  flushBuffer();
  return segments;
}

export function ChatRichText({ text, color }: ChatRichTextProps) {
  const { theme } = useAppTheme();
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const markerColor = color;

  const renderInlineContent = (line: string, keyPrefix: string) =>
    parseInlineSegments(line).map((segment, index) => (
      <Text
        key={`${keyPrefix}-${index}`}
        style={{
          fontStyle: segment.italic ? "italic" : "normal",
          fontWeight: segment.bold ? "700" : "400",
        }}
      >
        {segment.text}
      </Text>
    ));

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <View key={`spacer-${index}`} style={{ height: 4 }} />;
        }

        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          return (
            <Text
              key={`heading-${index}`}
              style={{
                color,
                fontFamily: theme.typography.display,
                fontSize: headingMatch[1].length === 1 ? 18 : 16,
                fontWeight: "700",
                lineHeight: headingMatch[1].length === 1 ? 24 : 22,
              }}
            >
              {renderInlineContent(headingMatch[2], `heading-inline-${index}`)}
            </Text>
          );
        }

        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (numberedMatch) {
          return (
            <View
              key={`numbered-${index}`}
              style={{
                flexDirection: "row",
                gap: theme.spacing.sm,
              }}
            >
              <Text
                style={{
                  color: markerColor,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  fontWeight: "700",
                  lineHeight: 22,
                }}
              >
                {numberedMatch[1]}.
              </Text>
              <Text
                style={{
                  color,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  lineHeight: 22,
                }}
              >
                {renderInlineContent(numberedMatch[2], `numbered-inline-${index}`)}
              </Text>
            </View>
          );
        }

        const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (bulletMatch) {
          return (
            <View
              key={`bullet-${index}`}
              style={{
                flexDirection: "row",
                gap: theme.spacing.sm,
              }}
            >
              <Text
                style={{
                  color: markerColor,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  fontWeight: "700",
                  lineHeight: 22,
                }}
              >
                •
              </Text>
              <Text
                style={{
                  color,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  lineHeight: 22,
                }}
              >
                {renderInlineContent(bulletMatch[1], `bullet-inline-${index}`)}
              </Text>
            </View>
          );
        }

        return (
          <Text
            key={`paragraph-${index}`}
            style={{
              color,
              fontFamily: theme.typography.body,
              fontSize: 14,
              lineHeight: 22,
            }}
          >
            {renderInlineContent(trimmed, `paragraph-inline-${index}`)}
          </Text>
        );
      })}
    </View>
  );
}
