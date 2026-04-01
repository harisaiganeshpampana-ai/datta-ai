export default async function handler(req, res) {
  try {
    const { message } = req.body;

    // temporary test response
    res.status(200).json({
      reply: "You said: " + message
    });

  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
}
