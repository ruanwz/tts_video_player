import re

def parse_vtt_time(time_str):
    # Format: HH:MM:SS.mmm
    parts = time_str.split(':')
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = float(parts[2])
    return hours * 3600 + minutes * 60 + seconds

def format_vtt_time(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"

def clean_vtt(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split into cues
    # VTT cues are separated by blank lines.
    # Regex to find cues: timestamp line followed by text
    cue_pattern = re.compile(r'(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3}).*?\n(.*?)(?=\n\n|\Z)', re.DOTALL)
    
    cues = []
    for match in cue_pattern.finditer(content):
        start_str, end_str, text_block = match.groups()
        start_time = parse_vtt_time(start_str)
        end_time = parse_vtt_time(end_str)
        
        lines = text_block.strip().split('\n')
        for line in lines:
            # Check for embedded timestamp
            # Format: <HH:MM:SS.mmm>
            embedded_time_match = re.search(r'<(\d{2}:\d{2}:\d{2}\.\d{3})>', line)
            line_start_time = start_time
            if embedded_time_match:
                line_start_time = parse_vtt_time(embedded_time_match.group(1))
            
            # Clean text: remove all tags <...>
            clean_text = re.sub(r'<[^>]+>', '', line).strip()
            
            if clean_text:
                cues.append({
                    'text': clean_text,
                    'start': line_start_time,
                    'original_end': end_time # Just for reference
                })

    # Deduplicate and merge
    unique_lines = []
    seen_texts = set()
    
    # Sort by start time
    cues.sort(key=lambda x: x['start'])
    
    for cue in cues:
        text = cue['text']
        # Simple deduplication: if text matches the LAST added line, skip.
        # (Don't use global seen_texts because a phrase might be repeated legitimately later in video)
        if unique_lines and unique_lines[-1]['text'] == text:
            continue
            
        unique_lines.append(cue)
        
    # Assign end times
    final_cues = []
    for i in range(len(unique_lines)):
        current = unique_lines[i]
        if i < len(unique_lines) - 1:
            next_cue = unique_lines[i+1]
            end_time = next_cue['start']
        else:
            # For the last line, use its original cue's end time? 
            # Or just add a default duration?
            # We stored 'original_end', but that might be from an early cue.
            # Let's assume a reasonable duration or try to find the max end time associated with this text.
            end_time = current['start'] + 5.0 # Fallback
            
        # Ensure start < end
        if end_time <= current['start']:
            end_time = current['start'] + 0.1
            
        final_cues.append({
            'start': current['start'],
            'end': end_time,
            'text': current['text']
        })
        
    # Write back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write("WEBVTT\n\n")
        for cue in final_cues:
            f.write(f"{format_vtt_time(cue['start'])} --> {format_vtt_time(cue['end'])}\n")
            f.write(f"{cue['text']}\n\n")
            
    print(f"Cleaned {file_path}")

clean_vtt('/Users/david/gitrepos/tts_video_player/video/Learn the basics of Google Antigravity.zh-Hans.vtt')
