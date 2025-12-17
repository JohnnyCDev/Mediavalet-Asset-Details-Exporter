# Mediavalet Asset Details Exporter Automation
MediaValet Asset Exporter is a tool to export all your MediaValet assets along with complete details into an Excel file. It supports exporting either all assets or assets from a specific category, including subcategories.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Features
- Credentials loaded securely from a `.env` file  
- Export **all assets** or assets from a **specific category**  
- Include **subcategories** if needed  
- Exported data saved directly to Excel  

## Steps to Use
1. Select whether you want to export **ALL assets** or only a **specific category**  
2. If in category mode, paste the **Category ID** from the URL  
3. Check if you want to include **subcategories**  
4. Click the **Export** button  
5. Wait for the download  

## Export Modes
**Export All Assets**  
- Download all assets in MediaValet  

**Export Specific Category**  
- Download assets from a specific category  

## Export to Excel
The tool uses the MediaValet Search API with proper pagination. The Excel file contains:  
- Asset ID, Name, Title, Description  
- **All Category Paths** (comma-separated)  
- Keywords, Dates, Dimensions  
- Download URLs  
- **All Custom Attributes**

