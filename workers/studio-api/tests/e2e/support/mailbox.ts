import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

/** An email as Pakshi sends it through Email Service, to one address or several. */
export interface Message {
  readonly from: string;
  readonly to: string | ReadonlyArray<string>;
  readonly subject: string;
  readonly text: string;
}

interface MailboxEnv {
  readonly MESSAGES: DurableObjectNamespace<Messages>;
}

/** Every message sent during a test file, in the order they were sent. */
export class Messages extends DurableObject {
  async add(message: Message) {
    const sent = (await this.ctx.storage.get<ReadonlyArray<Message>>("sent")) ?? [];
    await this.ctx.storage.put("sent", [...sent, message]);
  }

  async list(): Promise<ReadonlyArray<Message>> {
    return (await this.ctx.storage.get<ReadonlyArray<Message>>("sent")) ?? [];
  }
}

/**
 * Stands in for the Email Service binding. Email Service is outside the
 * Workers runtime, so tests keep what Pakshi sends and read it back.
 */
export class Mailbox extends WorkerEntrypoint<MailboxEnv> {
  async send(message: Message) {
    await this.#messages().add(message);
  }

  messages() {
    return this.#messages().list();
  }

  #messages() {
    return this.env.MESSAGES.get(this.env.MESSAGES.idFromName("all"));
  }
}

export default { fetch: () => new Response("Not found", { status: 404 }) };
