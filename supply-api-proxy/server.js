import express from "express";
import axios from "axios";

const app = express();
const PORT = 3000;
const URL = "<apiUrl>";

app.all("*", async (req, res) => {
  try {
    const response = await axios.get(URL, {
      // Configuring to follow up to 5 redirects:
      maxRedirects: 5,
      headers: {
        // Forwarding necessary headers
        "User-Agent": req.headers["user-agent"],
      },
    });
    // Sending back the response from the URL A
    res.send(response.data);
  } catch (error) {
    res.status(500).send("Error in proxy server");
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
