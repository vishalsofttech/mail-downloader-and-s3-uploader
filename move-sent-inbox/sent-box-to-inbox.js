require("dotenv").config();
const { ImapFlow } = require("imapflow");

const client = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: Number(process.env.IMAP_PORT),
  secure: process.env.IMAP_SECURE === "true",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
  logger: false,
});

async function moveAllSentToInbox() {
  try {
    console.log("Connecting...");

    await client.connect();
    // const mailboxes = await client.list();

    // console.log(mailboxes);

    console.log("Connected");

    // Lock Sent mailbox
    let lock = await client.getMailboxLock("Sent");

    console.log(client.mailbox);

    lock.release();

    return;

    try {
      console.log("Reading Sent mailbox...");

      const messages = [];

      for await (let msg of client.fetch("1:*", {
        uid: true,
      })) {
        messages.push(msg.uid);
      }

      console.log(`Found ${messages.length} mails`);

      if (!messages.length) {
        console.log("Nothing to move.");
        return;
      }

      const BATCH = 200;

      for (let i = 0; i < messages.length; i += BATCH) {
        const chunk = messages.slice(i, i + BATCH);

        console.log(`Moving ${i + 1}-${Math.min(i + BATCH, messages.length)}`);

        // Copy to Inbox
        await client.messageCopy(chunk, "INBOX");

        // Delete from Sent
        await client.messageDelete(chunk);
      }

      // Permanently delete deleted mails
      await client.mailboxClose({
        expunge: true,
      });

      console.log("Completed Successfully");
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.logout();
  }
}

moveAllSentToInbox();
