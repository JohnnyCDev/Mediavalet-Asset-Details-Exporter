import React, { useState } from 'react';
import { Download, AlertCircle, CheckCircle, Loader, FolderTree } from 'lucide-react';
import * as XLSX from 'xlsx';
import Header from "../components/Header";

export default function MediaValetExporter() {
  const [categoryId, setCategoryId] = useState('');
  const [includeSubcategories, setIncludeSubcategories] = useState(true);
  const [exportMode, setExportMode] = useState('all');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || '';
  const SUBSCRIPTION_KEY = process.env.NEXT_PUBLIC_SUBSCRIPTION_KEY || '';

  const fetchCategoryDetails = async (catId) => {
    try {
      const response = await fetch(
        `https://api.mediavalet.com/categories/${catId}`,
        {
          headers: {
            'x-mv-api-version': '1.2',
            'Authorization': `Bearer ${API_SECRET}`,
            'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch category details. Check the Category ID.');
      }

      const data = await response.json();
      return data.payload;
    } catch (err) {
      throw new Error(`Category fetch failed: ${err.message}`);
    }
  };

  const searchAssets = async (offset = 0, count = 100, catId = null) => {
    let searchBody;
    
    if (catId) {
      // Build containerfilter based on includeSubcategories option
      const containerfilter = includeSubcategories
        ? `(CategoryIds/ANY(c: c EQ '${catId}') OR CategoryAncestorIds/ANY(c: c EQ '${catId}'))`
        : `(CategoryIds/ANY(c: c EQ '${catId}'))`;
      
      searchBody = {
        includeSoftDeleted: false,
        search: '',
        count: count,
        offset: offset,
        sort: 'record.modifiedAt D',
        containerfilter: containerfilter,
        includeTotalCount: true,
      };
    } else {
      // Search all assets
      searchBody = {
        includeSoftDeleted: false,
        search: '',
        count: count,
        offset: offset,
        sort: 'record.modifiedAt D',
        includeTotalCount: true,
      };
    }

    const response = await fetch('https://api.mediavalet.com/assets/search', {
      method: 'POST',
      headers: {
        'x-mv-api-version': '1.2',
        'Authorization': `Bearer ${API_SECRET}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Search error:', errorText);
      throw new Error(`Failed to search assets: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  };

  const fetchAllAssets = async (catId = null) => {
    let allAssets = [];
    let offset = 0;
    const batchSize = 100;
    let totalCount = 0;

    // First request to get total count
    setProgress('Getting asset count...');
    const firstBatch = await searchAssets(offset, batchSize, catId);
    
    if (firstBatch.payload && firstBatch.payload.assetCount !== undefined) {
      totalCount = firstBatch.payload.assetCount;
      console.log('Total assets to fetch:', totalCount);
      
      if (totalCount === 0) {
        return [];
      }
      
      // Add first batch
      if (firstBatch.payload.assets && Array.isArray(firstBatch.payload.assets)) {
        allAssets = [...firstBatch.payload.assets];
        console.log(`First batch: Got ${firstBatch.payload.assets.length} assets`);
      }
      
      offset += batchSize;
      
      // Fetch remaining batches
      while (allAssets.length < totalCount) {
        setProgress(`Fetching assets ${allAssets.length + 1} to ${Math.min(allAssets.length + batchSize, totalCount)} of ${totalCount}...`);
        
        const data = await searchAssets(offset, batchSize, catId);
        
        if (data.payload && data.payload.assets && Array.isArray(data.payload.assets)) {
          const assets = data.payload.assets;
          
          if (assets.length === 0) {
            break;
          }
          
          allAssets = [...allAssets, ...assets];
          console.log(`Batch at offset ${offset}: Got ${assets.length} assets. Total: ${allAssets.length}`);
          
          offset += batchSize;
        } else {
          break;
        }
      }
    }

    console.log(`Total assets fetched: ${allAssets.length}`);
    return allAssets;
  };

  const getCategoryPath = async (categoryId) => {
    if (!categoryId) return '';
    
    try {
      const response = await fetch(
        `https://api.mediavalet.com/categories/${categoryId}`,
        {
          headers: {
            'x-mv-api-version': '1.2',
            'Authorization': `Bearer ${API_SECRET}`,
            'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.payload && data.payload.tree && data.payload.tree.path) {
          return data.payload.tree.path.replace(/\\/g, '/');
        }
      }
      
      return '';
    } catch (err) {
      console.error('Error fetching category path:', err);
      return '';
    }
  };

  const getAllCategoryPaths = (categoryIds, categoryPathCache) => {
    if (!categoryIds || categoryIds.length === 0) return '';
    
    // Get all category paths and join them with comma
    const paths = categoryIds
      .map(catId => categoryPathCache[catId])
      .filter(path => path) // Remove empty paths
      .join(', ');
    
    return paths;
  };

  const testConnection = async () => {
    try {
      setStatus('Testing connection...');
      const response = await fetch('https://api.mediavalet.com/assets/search', {
        method: 'POST',
        headers: {
          'x-mv-api-version': '1.2',
          'Authorization': `Bearer ${API_SECRET}`,
          'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          includeSoftDeleted: false,
          search: '',
          count: 1,
          offset: 0,
          includeTotalCount: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      return true;
    } catch (err) {
      throw new Error(`Connection test failed: ${err.message}`);
    }
  };

  const exportToExcel = async () => {
    setLoading(true);
    setError('');
    setStatus('');
    setProgress('');

    try {
      // Step 1: Test connection
      setStatus('Step 1: Testing connection...');
      await testConnection();
      
      let categoryName = '';
      let targetCategoryId = null;
      
      // Step 2: Get category details if in category mode
      if (exportMode === 'category' && categoryId) {
        setStatus('Step 2: Getting category details...');
        const categoryDetails = await fetchCategoryDetails(categoryId);
        categoryName = categoryDetails.name || '';
        targetCategoryId = categoryId;
        setProgress(`Category: ${categoryName}`);
      }
      
      // Step 3: Fetch all assets
      setStatus(exportMode === 'category' ? 'Step 3: Fetching assets from category...' : 'Step 2: Fetching all assets...');
      const assets = await fetchAllAssets(targetCategoryId);
      
      if (assets.length === 0) {
        throw new Error('No assets found' + (exportMode === 'category' ? ' in the selected category' : ''));
      }

      // Step 4: Build category path cache
      setStatus('Step 4: Building category paths...');
      const categoryPathCache = {};
      const uniqueCategoryIds = new Set();
      
      assets.forEach(asset => {
        if (asset.categories && Array.isArray(asset.categories)) {
          // Get ALL unique category IDs (not just the deepest)
          asset.categories.forEach(catId => {
            if (catId) {
              uniqueCategoryIds.add(catId);
            }
          });
        }
      });
      
      let processed = 0;
      for (const catId of uniqueCategoryIds) {
        if (processed % 10 === 0) {
          setProgress(`Processing category paths... ${processed}/${uniqueCategoryIds.size}`);
        }
        categoryPathCache[catId] = await getCategoryPath(catId);
        processed++;
      }
      
      // Step 5: Format data for Excel
      setStatus('Step 5: Preparing Excel file...');
      setProgress(`Processing ${assets.length} assets...`);

      const excelData = assets.map(asset => {
        // Get ALL category paths for this asset
        const allCategoryPaths = getAllCategoryPaths(asset.categories, categoryPathCache);
        
        const attributes = asset.attributes || {};
        
        return {
          'Asset ID': asset.id || '',
          'Asset Name': asset.file?.fileName || '',
          'Title': asset.file?.title || asset.title || '',
          'Description': asset.file?.description || asset.description || '',
          'Alt Text': asset.altText || '',
          'Media Type': asset.media?.type || '',
          'File Type': asset.file?.fileType || '',
          'MIME Type': asset.file?.mimeType || '',
          'Category Path': allCategoryPaths,
          'Keywords': asset.file?.keywords || (asset.keywords ? asset.keywords.join(', ') : ''),
          'File Size (bytes)': asset.file?.sizeInBytes || '',
          'Width': asset.file?.imageWidth || '',
          'Height': asset.file?.imageHeight || '',
          'Duration': asset.file?.length || '',
          'Bit Rate': asset.file?.bitRate || '',
          'Created Date': asset.file?.uploadedAt || asset.createdAt || '',
          'Modified Date': asset.file?.modifiedAt || '',
          'Approved Date': asset.file?.approvedAt || '',
          
          // Custom business metadata
          'Attribute AssetType': attributes['62e56442-1a48-443d-8fc7-513e4cf7d69e'] || '',
          'Attribute Series': attributes['8e286125-81c1-43e7-a1b7-3787fa16d2fc'] || '',
          'Attribute ModelCode': attributes['36c5fd35-a75b-49ba-85b7-981c6de4c42e'] || '',
          'Attribute Brand': attributes['536af291-fe5e-4cd2-82c7-bde871b7c5bd'] || '',
          'Attribute ModelName': attributes['115a5cf5-4be4-40ee-b1e0-1da0cb814d61'] || '',
          'Attribute Division': attributes['fe6cce62-000c-48d2-a889-4d0018e596cf'] || '',
          'Attribute CustomersDivision': attributes['f8f8bdb7-8ffc-4f8c-b74a-11ef90d9af26'] || '',
          'Attribute D365ItemNumber': attributes['30571d84-1cc3-4a08-958d-d516aeb4a115'] || '',
          'Attribute MaterialCategoryL1': attributes['d786b26b-1be9-4cc4-958f-c782460aecbc'] || '',
          'Attribute MaterialCategoryL2': attributes['8ca00043-6f71-4b4f-aa9c-c4e059b54c04'] || '',
          'Attribute MaterialCategoryL3': attributes['09ade9a3-2d0c-4146-8358-f46534b6bb25'] || '',
          'Attribute FileType': attributes['6955ea73-bf37-4da9-b481-1a876d2e4a17'] || '',
          'Attribute FileFormat': attributes['6da5ec1a-bc6d-4aba-a28d-1ca31d4392f5'] || '',
          'Attribute SubDivision': attributes['2235b989-c71b-4990-9e00-7570cddc5563'] || '',
          'Attribute SubAssetType': attributes['ab5aec64-5325-4856-929c-43e5a8bd8aeb'] || '',
          'Attribute ProductAngleView': attributes['66564a09-46a9-4a4d-9825-38a08374a1fa'] || '',
          
          // Download URLs
          'Download URL': asset.media?.download || '',
          'Original URL': asset.media?.original || '',
          'Thumbnail URL': asset.media?.thumb || '',
          'Small URL': asset.media?.small || '',
          'Medium URL': asset.media?.medium || '',
          'Large URL': asset.media?.large || '',
        };
      });

      // Step 6: Create Excel file
      setStatus('Step 6: Creating Excel file...');
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      // Set column widths - make Category Path column wider
      const columnWidths = [
        { wch: 40 }, // Asset ID
        { wch: 35 }, // Asset Name
        { wch: 30 }, // Title
        { wch: 40 }, // Description
        { wch: 25 }, // Alt Text
        { wch: 15 }, // Media Type
        { wch: 15 }, // File Type
        { wch: 20 }, // MIME Type
        { wch: 80 }, // Category Path (WIDER for multiple paths)
        { wch: 30 }, // Keywords
        { wch: 15 }, // File Size
        { wch: 10 }, // Width
        { wch: 10 }, // Height
        { wch: 15 }, // Duration
        { wch: 15 }, // Bit Rate
        { wch: 20 }, // Created Date
        { wch: 20 }, // Modified Date
        { wch: 20 }, // Approved Date
        { wch: 25 }, // Attribute AssetType
        { wch: 25 }, // Attribute Series
        { wch: 25 }, // Attribute ModelCode
        { wch: 25 }, // Attribute Brand
        { wch: 25 }, // Attribute ModelName
        { wch: 25 }, // Attribute Division
        { wch: 25 }, // Attribute CustomersDivision
        { wch: 25 }, // Attribute D365ItemNumber
        { wch: 25 }, // Attribute MaterialCategoryL1
        { wch: 25 }, // Attribute MaterialCategoryL2
        { wch: 25 }, // Attribute MaterialCategoryL3
        { wch: 25 }, // Attribute FileType
        { wch: 25 }, // Attribute FileFormat
        { wch: 25 }, // Attribute SubDivision
        { wch: 25 }, // Attribute SubAssetType
        { wch: 25 }, // Attribute ProductAngleView
        { wch: 60 }, // Download URL
        { wch: 60 }, // Original URL
        { wch: 60 }, // Thumbnail URL
        { wch: 60 }, // Small URL
        { wch: 60 }, // Medium URL
        { wch: 60 }, // Large URL
      ];
      worksheet['!cols'] = columnWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'MediaValet Assets');

      // Step 7: Download file
      setStatus('Step 7: Downloading file...');
      const date = new Date().toISOString().split('T')[0];
      const subcategoryIndicator = includeSubcategories ? 'with-subcategories' : 'category-only';
      const fileName = exportMode === 'category' && categoryName
        ? `MediaValet_${categoryName.replace(/[^a-z0-9]/gi, '_')}_${subcategoryIndicator}_${date}.xlsx`
        : `MediaValet_Assets_${date}.xlsx`;
      
      XLSX.writeFile(workbook, fileName);

      setStatus('✅ Success!');
      setProgress(`Successfully exported ${assets.length} assets to ${fileName}`);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setStatus('❌ Error occurred');
      setLoading(false);
      console.error('Export error:', err);
    }
  };

  return (
    <>
    <Header title="MediaValet Asset Exporter" /> 
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
              <Download className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              MediaValet Asset Exporter
            </h1>
            <p className="text-gray-600">
              Export all assets including all details
            </p>
          </div>

          {/* Credentials Status */}
          <div className={`mb-6 p-4 rounded-lg ${
            API_SECRET && SUBSCRIPTION_KEY 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-yellow-50 border border-yellow-200'
          }`}>
            <div className="flex items-center">
              {API_SECRET && SUBSCRIPTION_KEY ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-green-800 font-medium">Credentials loaded from .env file</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                  <span className="text-yellow-800 font-medium">Please configure .env.local file</span>
                </>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-blue-900 mb-2 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              Steps:
            </h2>
            <ol className="text-sm text-blue-800 space-y-1 ml-7 list-decimal">
              <li>Select whether you want to export <strong>ALL assets</strong> or only a <strong>specific category</strong></li>
              <li>If in category mode, paste the Category ID from the URL</li>
              <li>Check if you want to include <strong>subcategories</strong></li>
              <li>Click the Export button</li>
              <li>Wait for the download</li>
            </ol>
          </div>

          {/* Form */}
          <div className="space-y-4 mb-6">
            {/* Export Mode Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Export Mode
              </label>
              <div className="space-y-3">
                <label className="flex items-start cursor-pointer">
                  <input
                    type="radio"
                    name="exportMode"
                    value="all"
                    checked={exportMode === 'all'}
                    onChange={(e) => setExportMode(e.target.value)}
                    className="mt-1 mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Export All Assets</div>
                    <div className="text-sm text-gray-600">I-download lahat ng assets sa MediaValet</div>
                  </div>
                </label>

                <label className="flex items-start cursor-pointer">
                  <input
                    type="radio"
                    name="exportMode"
                    value="category"
                    checked={exportMode === 'category'}
                    onChange={(e) => setExportMode(e.target.value)}
                    className="mt-1 mr-3"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 flex items-center">
                      <FolderTree className="w-4 h-4 mr-1" />
                      Export Specific Category
                    </div>
                    <div className="text-sm text-gray-600 mb-2">I-download assets from specific category</div>
                    
                    {exportMode === 'category' && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <input
                            type="text"
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            placeholder="389fa9df-5434-40a2-a40c-7e6c19bf60e1"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-black"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            I-paste ang Category ID (makikita sa URL: search?categoryId=...)
                          </p>
                        </div>

                        <label className="flex items-center cursor-pointer p-3 bg-gray-50 rounded-lg">
                          <input
                            type="checkbox"
                            checked={includeSubcategories}
                            onChange={(e) => setIncludeSubcategories(e.target.checked)}
                            className="mr-3"
                          />
                          <div className="text-sm">
                            <span className="font-medium text-gray-900">Include Subcategories</span>
                            <p className="text-gray-600">Kasama ang lahat ng sub-folders at lahat ng assets nandun</p>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <button
            onClick={exportToExcel}
            disabled={loading || !API_SECRET || !SUBSCRIPTION_KEY || (exportMode === 'category' && !categoryId)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>Export Assets to Excel</span>
              </>
            )}
          </button>

          {/* Status Messages */}
          {status && (
            <div className={`mt-4 p-4 rounded-lg ${
              status.includes('Success') 
                ? 'bg-green-50 border border-green-200' 
                : status.includes('Error')
                ? 'bg-red-50 border border-red-200'
                : 'bg-blue-50 border border-blue-200'
            }`}>
              <div className="flex items-start">
                {status.includes('Success') ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                ) : status.includes('Error') ? (
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                ) : (
                  <Loader className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0 animate-spin" />
                )}
                <div className="flex-1">
                  <p className={`font-medium ${
                    status.includes('Success') 
                      ? 'text-green-800' 
                      : status.includes('Error')
                      ? 'text-red-800'
                      : 'text-blue-800'
                  }`}>
                    {status}
                  </p>
                  {progress && (
                    <p className="text-sm text-gray-600 mt-1">{progress}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-800">Error:</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info Footer */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Using the MediaValet Search API with proper pagination. The Excel file will contain: Asset ID, Name, Title, Description, <strong>all Category Paths (comma-separated)</strong>, Keywords, Dates, Dimensions, Download URLs, and <strong>all Custom Attributes</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}