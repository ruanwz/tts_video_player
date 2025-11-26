import asyncio
import edge_tts
import logging

logging.basicConfig(level=logging.INFO)

async def test_tts():
    text = "Hello world"
    voice = "en-US-AriaNeural" # Try a different voice
    output_file = "test_tts_aria.mp3"

    print(f"Testing Edge TTS with: voice={voice} (no rate)")
    
    try:
        communicate = edge_tts.Communicate(text, voice) # No rate
        await communicate.save(output_file)
        print(f"Success! Saved to {output_file}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_tts())
