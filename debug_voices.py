import asyncio
import edge_tts
import json

async def main():
    voices = await edge_tts.list_voices()
    # Print the first voice to see the structure
    if voices:
        print(json.dumps(voices[0], indent=2))
        # Also print a Chinese voice to be sure
        zh_voice = next((v for v in voices if "zh" in v['Locale']), None)
        if zh_voice:
            print("Chinese Voice Example:")
            print(json.dumps(zh_voice, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
