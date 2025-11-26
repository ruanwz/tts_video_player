import asyncio
import edge_tts

async def test():
    text = "你好，世界"
    voice = "zh-CN-XiaoxiaoNeural"
    rate = "+0%"
    output_file = "debug_tts.mp3"
    
    print(f"Testing Edge TTS with voice={voice}, rate={rate}...")
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        await communicate.save(output_file)
        print("Success! Audio saved to", output_file)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(test())
