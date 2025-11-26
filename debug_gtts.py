from gtts import gTTS
import os

def test_gtts():
    text = "你好，我是谷歌语音。Hello, this is Google TTS."
    output_file = "test_gtts.mp3"
    
    print(f"Testing gTTS...")
    try:
        tts = gTTS(text=text, lang='zh-cn')
        tts.save(output_file)
        print(f"Success! Saved to {output_file}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_gtts()
