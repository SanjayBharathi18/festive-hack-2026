export type SseEvent = { event: string; data: string };

export function sseReader(response: Response) {
  const body = response.body;
  if (body === null) throw new Error("The response has no body.");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const next = async (): Promise<SseEvent | undefined> => {
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        return parse(block);
      }
      const { done, value } = await reader.read();
      if (done) return undefined;
      buffer += decoder.decode(value, { stream: true });
    }
  };
  const nextOf = async (type: string): Promise<SseEvent | undefined> => {
    for (;;) {
      const event = await next();
      if (event === undefined || event.event === type) return event;
    }
  };
  return { next, nextOf, cancel: () => reader.cancel() };
}

function parse(block: string): SseEvent {
  const fields = block.split("\n").map((line) => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon), line.slice(colon + 1).trimStart()] as const;
  });
  return {
    event: fields.find(([name]) => name === "event")?.[1] ?? "message",
    data: fields
      .filter(([name]) => name === "data")
      .map(([, value]) => value)
      .join("\n"),
  };
}
