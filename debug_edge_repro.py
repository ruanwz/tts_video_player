import asyncio
import edge_tts
import logging

logging.basicConfig(level=logging.INFO)

async def test_tts():
    text = "你好，我是这个声音。Hello, this is a sample."
    voice = "zh-CN-XiaoxiaoNeural"
    rate = "+0%"
    output_file = "test_tts.mp3"

    print(f"Testing Edge TTS with: voice={voice}, rate={rate}")
    
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        await communicate.save(output_file)
        print(f"Success! Saved to {output_file}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_tts())
