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
    email: "hrd@bfccapital.com",
    password: "1234567890",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "niteshrai@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "zuhaib@bfccapital.com",
    password: "knA09$@*N1",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "navneetsingh@bfccapital.com",
    password: "Navneet@0051",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "shubhamdubey@bfccapital.com",
    password: "shubhbfc@2025",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "investmentadvisor@bfccapital.com",
    password: "Initial$1",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "shivangiyadav@bfccapital.com",
    password: "Bulishbites@2020",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "anuragjaiswal@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "sandeepyadav@bfccapital.com",
    password: "P@ssw0rd",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "paritoshsingh@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "shashankawasthi@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "nainierastogi@bfccapital.com",
    password: "BFCcapital@2025",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "pankajkumar@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "anukritijoshi@bfccapital.com",
    password: "asdfghjkl@25",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "chitranshusrivastava@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "dhritimishra@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "alok@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "ayushmishra@bfccapital.com",
    password: "BFC@2023",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "research@bfccapital.com",
    password: "Akash@123",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "sparshawasthi@bfccapital.com",
    password: "Sparsh@0624",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "akashgupta@bfccapital.com",
    password: "Initial$1",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "enquiry@bfccapital.com",
    password: "123456789",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "khushalkohli@bfccapital.com",
    password: "Khushal@06",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "ravisingh@bfccapital.com",
    password: "Nishu@181",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "admin@bfccapital.com",
    password: "Bfctemp@2026",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "deeptibansal@bfccapital.com",
    password: "BFC@2023",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "customersupport@bfccapital.com",
    password: "Harry@2022",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "anuragagarwal@bfccapital.com",
    password: "Welcome@123",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "accounts@bfccapital.com",
    password: "bfc@2004",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "hrd@bfccapital.com",
    password: "Yashi@181",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "operations@bfccapital.com",
    password: "Operations@2025",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "sharadbindal@bfccapital.com",
    password: "Bfctemp@2026",
    host: "imap.rediffmailpro.com",
  },
  {
    email: "sunilgupta@bfccapital.com",
    password: "Bfctemp@2026",
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
