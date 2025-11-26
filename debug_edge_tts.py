import asyncio
import edge_tts
import os

async def test_tts():
    text = "测试语音合成"
    voice = "zh-CN-XiaoxiaoNeural"
    rate = "+0%"
    output_file = "test_tts.mp3"
    
    print(f"Testing TTS with: text='{text}', voice='{voice}', rate='{rate}'")
    
    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        await communicate.save(output_file)
        print(f"Success! Saved to {output_file}")
        
        # Check file size
        size = os.path.getsize(output_file)
        print(f"File size: {size} bytes")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_tts())
