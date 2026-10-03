import { type StreamChunk, StreamProcessor } from "@tanstack/ai";

/** The conversation as the chat panel shows it once it has followed a turn's events. */
export const follow = async (events: AsyncIterable<StreamChunk>) => {
  const processor = new StreamProcessor();
  for await (const event of events) processor.processChunk(event);
  processor.finalizeStream();
  return processor.getMessages();
};

/** The parts of every message in a conversation, in order. */
export const partsOf = (messages: Awaited<ReturnType<typeof follow>>) =>
  messages.flatMap((message) => message.parts);

/** The tool calls the chat shows for one tool, in order. */
export const toolParts = (messages: Awaited<ReturnType<typeof follow>>, name: string) =>
  partsOf(messages).filter((part) => part.type === "tool-call" && part.name === name);
