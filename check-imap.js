const Imap = require("imap");

function checkImap(email, password, host, port = 993) {
  return new Promise((resolve) => {
    const imap = new Imap({
      user: email,
      password,
      host,
      port,
      tls: true,
      authTimeout: 10000,
      connTimeout: 10000,
    });

    imap.once("ready", () => {
      imap.end();
      resolve({
        email,
        success: true,
        message: "IMAP enabled",
      });
    });

    imap.once("error", (err) => {
      resolve({
        email,
        success: false,
        message: err.message,
      });
    });

    imap.connect();
  });
}

const accounts = [
  {
    email: "projectcoordinator@bfcpublications.com",
    password: "self@6596",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "gaurav@bfcpublications.com",
    password: "bfcpub@2222",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "support@bfcpublications.com",
    password: "Navneet@2580",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "amitapandey@bfcpublications.com",
    password: "amita@2022",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "deepshikha@bfcpublications.com",
    password: "Dm098765@",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "garimasingh@bfcpublications.com",
    password: "garima@2023",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "shivangiyadav@bfcpublications.com",
    password: "shivangi@2021",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "chitranshbfcpub@bfcpublications.com",
    password: "chitransh@20",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "vaishnavivijay@bfcpublications.com",
    password: "Capital@12345",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "ashishkverma@bfcpublications.com",
    password: "bfc@2022",
    host: "imap.rediffmailpro.com",
  },

  {
    email: "chitrapal@bfcpublications.com",
    password: "Chitra@2026",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "shwetamishra@bfcpublications.com",
    password: "Shweta@1998",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "nehasahu@bfcpublications.com",
    password: "neha@0808",
    host: "imap.rediffmailpro.com",
  },

  {
    email: "anamikasingh@bfcpublications.com",
    password: "Anamika@3131",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "authorsupport@bfcpublications.com",
    password: "Garima@2580",
    host: "imap.rediffmailpro.com",
  },
];

(async () => {
  for (const account of accounts) {
    const result = await checkImap(
      account.email,
      account.password,
      account.host,
    );
    console.log(result);
  }
})();
