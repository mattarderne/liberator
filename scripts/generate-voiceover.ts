/**
 * Generate Voiceover using 11Labs API
 *
 * Usage: ELEVENLABS_API_KEY=your_key npx ts-node scripts/generate-voiceover.ts
 */

import fs from "fs";
import path from "path";
import https from "https";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Voice options: https://api.elevenlabs.io/v1/voices
// Popular voices: "21m00Tcm4TlvDq8ikWAM" (Rachel), "AZnzlk1XvdvUeBnXmlld" (Domi)
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel - clear, professional

const VOICEOVER_TEXT = `Your ideas are scattered across ChatGPT, Claude, and Gemini. Where was that API conversation? That code snippet? You can't remember which AI you used.

Liberator brings all your AI conversations together in one searchable, local-first database.

Search across every provider instantly. Filter by ChatGPT, Claude, or Gemini. Find any conversation in seconds.

Open the full conversation. See the complete context. Your ideas, preserved and accessible.

Quick access from any page. Search, navigate, and open threads without leaving your workflow.

Liberator. Set your AI chats free. Install the Chrome extension today—it's open source and your data stays local.`;

async function generateVoiceover() {
  if (!ELEVENLABS_API_KEY) {
    console.error("Error: ELEVENLABS_API_KEY environment variable not set");
    console.log("Usage: ELEVENLABS_API_KEY=your_key npx ts-node scripts/generate-voiceover.ts");
    process.exit(1);
  }

  console.log("Generating voiceover with 11Labs...\n");
  console.log("Voice ID:", VOICE_ID);
  console.log("Text length:", VOICEOVER_TEXT.length, "characters\n");

  const outputPath = path.resolve(__dirname, "../demo/voiceover.mp3");

  const requestBody = JSON.stringify({
    text: VOICEOVER_TEXT,
    model_id: "eleven_turbo_v2_5",  // Updated model for free tier
    voice_settings: {
      stability: 0.75,
      similarity_boost: 0.75,
    },
  });

  return new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.elevenlabs.io",
        path: `/v1/text-to-speech/${VOICE_ID}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
          Accept: "audio/mpeg",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            console.error(`Error ${res.statusCode}:`, data);
            reject(new Error(`API returned ${res.statusCode}`));
          });
          return;
        }

        const file = fs.createWriteStream(outputPath);
        res.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log("Voiceover saved to:", outputPath);
          console.log("\nNext steps:");
          console.log("1. Combine with video using ffmpeg:");
          console.log(
            '   ffmpeg -i demo/demo.mp4 -i demo/voiceover.mp3 -c:v copy -c:a aac -shortest demo/demo-with-audio.mp4'
          );
          resolve();
        });
      }
    );

    req.on("error", reject);
    req.write(requestBody);
    req.end();
  });
}

generateVoiceover().catch(console.error);
