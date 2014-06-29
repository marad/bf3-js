Battlefield 3 Server Communication Protocol Implementation
==========================================================

What is this?
-------------
This is simple command line tool to connect to your BF3 server and 

Why I need it?
--------------
For a couple of reasons really:
* I wanted to create some stats page for BF server I am administering
* Learning Node.js's `net` module
* For fun :)
* (BONUS) ProCON is written in .NET (so windows only) and is extremely not-lightweight

Want to use it?
---------------
No problem just four steps:

1. Clone the repository
2. Do `npm install`
3. Setup `serverIp`, `serverPort` and `adminPassword` in `main.js` file.
4. Run it with `node main` and start typing commands to your server :)
