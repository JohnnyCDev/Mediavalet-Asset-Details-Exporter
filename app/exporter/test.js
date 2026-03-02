'use client';

import React, { useState } from 'react';
import { Download, AlertCircle, CheckCircle, Loader, FolderTree, Calendar, FastForward } from 'lucide-react';
import * as XLSX from 'xlsx';
import Header from "../components/Header";

export default function MediaValetExporter() {
  const [categoryId, setCategoryId] = useState('');
  const [includeSubcategories, setIncludeSubcategories] = useState(true);
  const [exportMode, setExportMode] = useState('all');
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [useOffset, setUseOffset] = useState(false);
  const [offsetValue, setOffsetValue] = useState('');
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

  const searchAssets = async (offset = 0, count = 100, catId = null, dateFrom = null) => {
    // Build the search body according to MediaValet API
    let searchBody = {
      offset: offset,
      count: count,
      search: '*',
      searchFields: 'cognitiveTextInImage,cognitiveTags,videoIntelligence,faceRecognition,comments,description,attributes,categoryNames,categoryAncestorNames,title,fileName,keywords',
      sort: 'record.createdAt D',
      includeTotalCount: true,
    };
    
    // Build filters array
    let filterParts = [];
    
    // Add date filter if specified
    if (dateFrom) {
      // Format: DateUploaded GE 2025-12-01T00:00:00.000Z
      const dateFilter = `(DateUploaded GE ${dateFrom}T00:00:00.000Z)`;
      filterParts.push(dateFilter);
    }
    
    // Combine all filters with AND
    if (filterParts.length > 0) {
      searchBody.filters = `(${filterParts.join(' AND ')})`;
    }
    
    // Add category filter separately using containerFilter
    if (catId) {
      searchBody.containerFilter = includeSubcategories
        ? `(CategoryIds/ANY(c: c EQ '${catId}') OR CategoryAncestorIds/ANY(c: c EQ '${catId}'))`
        : `(CategoryIds/ANY(c: c EQ '${catId}'))`;
    } else {
      searchBody.containerFilter = '';
    }

    console.log('Search body:', JSON.stringify(searchBody, null, 2));

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

  const fetchAllAssets = async (catId = null, dateFrom = null, startOffset = 0) => {
    let allAssets = [];
    let offset = startOffset; // Start from custom offset if provided
    const batchSize = 100;
    let totalCount = 0;

    setProgress(`Getting asset count... ${startOffset > 0 ? `(starting from offset ${startOffset})` : ''}`);
    const firstBatch = await searchAssets(offset, batchSize, catId, dateFrom);
    
    if (firstBatch.payload && firstBatch.payload.assetCount !== undefined) {
      totalCount = firstBatch.payload.assetCount;
      console.log('Total assets available:', totalCount);
      console.log('Starting from offset:', startOffset);
      console.log('Assets to fetch:', totalCount - startOffset);
      
      if (totalCount === 0 || startOffset >= totalCount) {
        return [];
      }
      
      if (firstBatch.payload.assets && Array.isArray(firstBatch.payload.assets)) {
        allAssets = [...firstBatch.payload.assets];
        console.log(`First batch: Got ${firstBatch.payload.assets.length} assets`);
      }
      
      offset += batchSize;
      
      while (allAssets.length < totalCount - startOffset && offset < totalCount) {
        const currentCount = startOffset + allAssets.length;
        const remainingTotal = totalCount - startOffset;
        setProgress(`Fetching assets ${currentCount + 1} to ${Math.min(currentCount + batchSize, totalCount)} of ${remainingTotal} (offset: ${offset})...`);
        
        const data = await searchAssets(offset, batchSize, catId, dateFrom);
        
        if (data.payload && data.payload.assets && Array.isArray(data.payload.assets)) {
          const assets = data.payload.assets;
          
          if (assets.length === 0) {
            console.log('No more assets returned, stopping...');
            break;
          }
          
          allAssets = [...allAssets, ...assets];
          console.log(`Batch at offset ${offset}: Got ${assets.length} assets. Total fetched: ${allAssets.length}`);
          
          offset += batchSize;
        } else {
          break;
        }
      }
    }

    console.log(`Total assets fetched: ${allAssets.length} (from offset ${startOffset})`);
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
    
    const paths = categoryIds
      .map(catId => categoryPathCache[catId])
      .filter(path => path)
      .join(', ');
    
    return paths;
  };

  const exportToExcel = async () => {
    setLoading(true);
    setError('');
    setStatus('');
    setProgress('');

    try {
      setStatus('Step 1: Testing connection...');
      
      let categoryName = '';
      let targetCategoryId = null;
      let dateFromFilter = useDateFilter ? startDate : null;
      let startOffsetValue = useOffset ? parseInt(offsetValue) || 0 : 0;
      
      if (exportMode === 'category' && categoryId) {
        setStatus('Step 2: Getting category details...');
        const categoryDetails = await fetchCategoryDetails(categoryId);
        categoryName = categoryDetails.name || '';
        targetCategoryId = categoryId;
        setProgress(`Category: ${categoryName}`);
      }
      
      const filterInfo = useDateFilter ? ` (from ${startDate})` : '';
      const offsetInfoStatus = useOffset ? ` (starting from offset ${startOffsetValue})` : '';
      setStatus(`${exportMode === 'category' ? 'Step 3' : 'Step 2'}: Fetching assets${filterInfo}${offsetInfoStatus}...`);
      
      const assets = await fetchAllAssets(targetCategoryId, dateFromFilter, startOffsetValue);
      
      if (assets.length === 0) {
        setStatus('ℹ️ No Assets Found');
        let infoMsg = 'Walang assets na nakita';
        
        if (useOffset && startOffsetValue > 0) {
          infoMsg = `Walang assets na nakita from offset ${startOffsetValue}. The offset might be beyond the total asset count.`;
        } else if (exportMode === 'category' && useDateFilter) {
          infoMsg = `Walang assets sa category na ito na na-upload from ${startDate} onwards`;
        } else if (exportMode === 'category') {
          infoMsg = 'Walang assets sa selected category';
        } else if (useDateFilter) {
          infoMsg = `Walang assets na na-upload from ${startDate} onwards`;
        }
        
        setProgress(infoMsg + '. Try adjusting your filters, date range, or offset value.');
        setLoading(false);
        return;
      }

      setStatus('Step 4: Building category paths...');
      const categoryPathCache = {};
      const uniqueCategoryIds = new Set();
      
      assets.forEach(asset => {
        if (asset.categories && Array.isArray(asset.categories)) {
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
      
      setStatus('Step 5: Preparing Excel file...');
      setProgress(`Processing ${assets.length} assets...`);

      const excelData = assets.map(asset => {
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
          'Download URL': asset.media?.download || '',
          'Original URL': asset.media?.original || '',
          'Thumbnail URL': asset.media?.thumb || '',
          'Small URL': asset.media?.small || '',
          'Medium URL': asset.media?.medium || '',
          'Large URL': asset.media?.large || '',
        };
      });

      setStatus('Step 6: Creating Excel file...');
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      const columnWidths = [
        { wch: 40 }, { wch: 35 }, { wch: 30 }, { wch: 40 }, { wch: 25 },
        { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 80 }, { wch: 30 },
        { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
        { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 25 },
        { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
        { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
        { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 60 },
        { wch: 60 }, { wch: 60 }, { wch: 60 }, { wch: 60 }, { wch: 60 },
      ];
      worksheet['!cols'] = columnWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'MediaValet Assets');

      setStatus('Step 7: Downloading file...');
      const date = new Date().toISOString().split('T')[0];
      const subcategoryIndicator = includeSubcategories ? 'with-subcategories' : 'category-only';
      const dateIndicator = useDateFilter ? `_from-${startDate}` : '';
      const offsetIndicator = useOffset ? `_offset-${startOffsetValue}` : '';
      const fileName = exportMode === 'category' && categoryName
        ? `MediaValet_${categoryName.replace(/[^a-z0-9]/gi, '_')}_${subcategoryIndicator}${dateIndicator}${offsetIndicator}_${date}.xlsx`
        : `MediaValet_Assets${dateIndicator}${offsetIndicator}_${date}.xlsx`;
      
      XLSX.writeFile(workbook, fileName);

      setStatus('✅ Success!');
      const dateInfo = useDateFilter ? ` from ${startDate}` : '';
      const offsetInfoSuccess = useOffset ? ` (starting from offset ${startOffsetValue})` : '';
      setProgress(`Successfully exported ${assets.length} assets${dateInfo}${offsetInfoSuccess} to ${fileName}`);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setStatus('❌ Error occurred');
      setLoading(false);
      console.error('Export error:', err);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <>
      <Header title="MediaValet Asset Exporter" />
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-4 sm:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-xl p-6 sm:p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
                <Download className="w-8 h-8 text-indigo-600" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                MediaValet Asset Exporter
              </h1>
              <p className="text-gray-600 text-sm sm:text-base">
                Export all assets including all details
              </p>
            </div>

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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h2 className="font-semibold text-blue-900 mb-3 flex items-center text-sm sm:text-base">
                <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                How to Use (Step-by-Step):
              </h2>
              <ol className="text-xs sm:text-sm text-blue-800 space-y-2 ml-7 list-decimal">
                <li><strong>Step 1:</strong> Choose whether you want to export <strong>ALL assets</strong> or only a <strong>specific category</strong>.</li>
                <li><strong>Step 2:</strong> (Optional) Apply a <strong>date filter</strong> to get only assets from a specific date onwards.</li>
                <li><strong>Step 3:</strong> (Optional) Use <strong>offset</strong> to resume fetching from a specific position (useful for large libraries with 100K+ assets).</li>
                <li><strong>Step 4:</strong> If in category mode, paste the Category ID from the URL.</li>
                <li><strong>Step 5:</strong> If you want subcategories, check "Include Subcategories."</li>
                <li><strong>Step 6:</strong> Click "Export Assets to Excel" and wait for download.</li>
              </ol>
            </div>

            <div className="space-y-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  1️⃣ Export Mode
                </label>
                <div className="space-y-3">
                  <label className="flex items-start cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="radio"
                      name="exportMode"
                      value="all"
                      checked={exportMode === 'all'}
                      onChange={(e) => setExportMode(e.target.value)}
                      className="mt-1 mr-3 shrink-0"
                    />
                    <div>
                      <div className="font-medium text-gray-900">Export All Assets</div>
                      <div className="text-sm text-gray-600">Download all assets from MediaValet</div>
                    </div>
                  </label>

                  <label className="flex items-start cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition">
                    <input
                      type="radio"
                      name="exportMode"
                      value="category"
                      checked={exportMode === 'category'}
                      onChange={(e) => setExportMode(e.target.value)}
                      className="mt-1 mr-3 shrink-0"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 flex items-center">
                        <FolderTree className="w-4 h-4 mr-1" />
                        Export Specific Category
                      </div>
                      <div className="text-sm text-gray-600">Download assets from specific category only</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="border-t pt-6">
                <label className="flex items-start cursor-pointer p-4 bg-purple-50 border-2 border-purple-200 rounded-lg hover:bg-purple-100 transition">
                  <input
                    type="checkbox"
                    checked={useDateFilter}
                    onChange={(e) => setUseDateFilter(e.target.checked)}
                    className="mt-1 mr-3 shrink-0"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 flex items-center mb-1">
                      <Calendar className="w-4 h-4 mr-2" />
                      2️⃣ Filter by Upload Date (Optional)
                    </div>
                    <div className="text-sm text-gray-600 mb-3">
                      Check this to get only assets uploaded from a specific date to today
                    </div>
                    
                    {useDateFilter && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Start Date (From Date):
                        </label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          max={today}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 bg-white"
                          style={{ colorScheme: 'light' }}
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          📅 Example: If you select "2024-01-01," you'll get all assets uploaded from January 1, 2024 to today ({today})
                        </p>
                        {startDate && (
                          <p className="text-xs font-medium text-purple-700 mt-2 bg-purple-100 p-2 rounded">
                            ✅ Selected: {startDate} (Assets from this date onwards will be exported)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              </div>

              <div className="border-t pt-6">
                <label className="flex items-start cursor-pointer p-4 bg-orange-50 border-2 border-orange-200 rounded-lg hover:bg-orange-100 transition">
                  <input
                    type="checkbox"
                    checked={useOffset}
                    onChange={(e) => setUseOffset(e.target.checked)}
                    className="mt-1 mr-3 shrink-0"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 flex items-center mb-1">
                      <FastForward className="w-4 h-4 mr-2" />
                      3️⃣ Use Custom Offset (Advanced - Optional)
                    </div>
                    <div className="text-sm text-gray-600 mb-3">
                      Resume fetching from a specific position. Useful for libraries with 100,000+ assets where API has limits.
                    </div>
                    
                    {useOffset && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Offset Value (Starting Position):
                        </label>
                        <input
                          type="number"
                          value={offsetValue}
                          onChange={(e) => setOffsetValue(e.target.value)}
                          min="0"
                          step="1"
                          placeholder="100000"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 bg-white"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          ⚡ Example Scenario: Your library has 200,000 assets but API only fetched 100,100. Set offset to <strong>100000</strong> to get the next batch (assets 100,001-200,000).
                        </p>
                        {offsetValue && parseInt(offsetValue) > 0 && (
                          <p className="text-xs font-medium text-orange-700 mt-2 bg-orange-100 p-2 rounded">
                            ✅ Will start from asset #{offsetValue} onwards
                          </p>
                        )}
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-xs text-blue-800">
                            <strong>💡 Pro Tip:</strong> If you have 200K assets:
                            <br/>• 1st export: offset 0 (gets 0-100K)
                            <br/>• 2nd export: offset 100000 (gets 100K-200K)
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>

              {exportMode === 'category' && (
                <div className="border-t pt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    4️⃣ Category ID (Paste from URL)
                  </label>
                  <input
                    type="text"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    placeholder="389fa9df-5434-40a2-a40c-7e6c19bf60e1"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    💡 Paste the Category ID (found in URL: search?categoryId=...)
                  </p>

                  <label className="flex items-center cursor-pointer p-3 bg-gray-50 rounded-lg mt-4">
                    <input
                      type="checkbox"
                      checked={includeSubcategories}
                      onChange={(e) => setIncludeSubcategories(e.target.checked)}
                      className="mr-3"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">5️⃣ Include Subcategories</span>
                      <p className="text-gray-600">Include all sub-folders and assets inside</p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            <button
              onClick={exportToExcel}
              disabled={loading || !API_SECRET || !SUBSCRIPTION_KEY || (exportMode === 'category' && !categoryId) || (useDateFilter && !startDate) || (useOffset && !offsetValue)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2 text-sm sm:text-base"
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

            {exportMode === 'category' && !categoryId && (
              <p className="mt-2 text-sm text-orange-600 text-center">
                ⚠️ You need to enter a Category ID
              </p>
            )}
            {useDateFilter && !startDate && (
              <p className="mt-2 text-sm text-orange-600 text-center">
                ⚠️ You need to select a start date
              </p>
            )}
            {useOffset && !offsetValue && (
              <p className="mt-2 text-sm text-orange-600 text-center">
                ⚠️ You need to enter an offset value
              </p>
            )}

            {status && (
              <div className={`mt-4 p-4 rounded-lg ${
                status.includes('Success') 
                  ? 'bg-green-50 border border-green-200' 
                  : status.includes('Error')
                  ? 'bg-red-50 border border-red-200'
                  : status.includes('No Assets Found')
                  ? 'bg-yellow-50 border border-yellow-200'
                  : 'bg-blue-50 border border-blue-200'
              }`}>
                <div className="flex items-start">
                  {status.includes('Success') ? (
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-2 shrink-0" />
                  ) : status.includes('Error') ? (
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2 shrink-0" />
                  ) : status.includes('No Assets Found') ? (
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 shrink-0" />
                  ) : (
                    <Loader className="w-5 h-5 text-blue-600 mt-0.5 mr-2 shrink-0 animate-spin" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium text-sm ${
                      status.includes('Success') 
                        ? 'text-green-800' 
                        : status.includes('Error')
                        ? 'text-red-800'
                        : status.includes('No Assets Found')
                        ? 'text-yellow-800'
                        : 'text-blue-800'
                    }`}>
                      {status}
                    </p>
                    {progress && (
                      <p className="text-xs sm:text-sm text-gray-700 mt-1">{progress}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2 shrink-0" />
                  <div>
                    <p className="font-medium text-red-800 text-sm">Error:</p>
                    <p className="text-xs sm:text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                📊 The Excel file will contain: Asset ID, Name, Title, Description, all Category Paths, Upload Date, Modified Date, Download URLs, and all Custom Attributes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}