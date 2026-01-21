# Screen Draw

A lightweight Chrome extension for drawing and annotating on any webpage. Perfect for presentations, tutorials, bug reports, or just doodling.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/YOUR_USERNAME)
[![Twitter Follow](https://img.shields.io/twitter/follow/lucamakes?style=social)](https://twitter.com/lucamakes)

![Screen Draw Demo](demo.gif)

## Features

- **Pen Tool** - Smooth freehand drawing with adjustable size
- **Highlighter** - Semi-transparent strokes for highlighting content
- **Text Tool** - Add text annotations anywhere on the page
- **Eraser** - Remove parts of your drawings
- **Arrow Tool** - Draw arrows to point at things
- **Rectangle Tool** - Draw rectangles to highlight areas
- **Circle Tool** - Draw circles/ellipses
- **Color Picker** - 10 preset colors + custom color picker
- **Undo/Redo** - Easily revert mistakes or redo actions
- **Clear** - Start fresh
- **Screenshot** - Capture the page with your annotations as PNG
- **Auto-Save** - Drawings persist per URL and reload when you revisit
- **Collapsible Sidebar** - Minimal UI that stays out of your way
- **Scroll Support** - Drawings stay anchored to page content
- **Keyboard Shortcuts** - Fast tool switching without clicking

## Installation

### From Source
1. Clone this repository
   ```bash
   git clone https://github.com/cassierstudios/Drawr.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `Drawr` folder

### From Chrome Web Store
*Coming soon*

## Usage

1. Click the Screen Draw icon in your browser toolbar to activate
2. Select a tool from the sidebar
3. Draw on the page
4. Click the icon again to deactivate

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Pointer mode (interact with page) |
| `2` | Pen tool |
| `3` | Highlighter |
| `4` | Eraser |
| `5` | Text tool |
| `A` | Arrow tool |
| `R` | Rectangle tool |
| `C` | Circle tool |
| `Z` | Undo |
| `Y` | Redo |
| `S` | Screenshot |
| `D` | Clear all |
| `H` | Toggle sidebar |

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Canvas API for drawing
- Chrome Extension Manifest V3
- Google Material Symbols for icons

## Performance

Screen Draw is optimized for smooth drawing:
- Fixed-position canvas with scroll-aware rendering
- Stroke-based storage instead of pixel data
- Throttled event handlers
- Bezier curve smoothing with path simplification

## Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## License

MIT License - see [LICENSE](LICENSE) for details

## Support

If you find this useful, consider:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/YOUR_USERNAME)

## Contact

Got questions or feedback? Reach out on Twitter: [@lucamakes](https://twitter.com/lucamakes)

## Acknowledgments

- Icons by [Google Material Symbols](https://fonts.google.com/icons)
- Font by [Inter](https://rsms.me/inter/)
