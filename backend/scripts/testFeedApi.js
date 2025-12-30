/**
 * Test script to verify Phase-1 and Phase-2 feed API endpoints
 * Usage: node scripts/testFeedApi.js
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';

async function testFeedApi() {
  console.log('🧪 Testing Feed API Endpoints\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  try {
    // Test Phase-1 (Lite) endpoint
    console.log('📦 Testing Phase-1 (Lite) Endpoint: GET /api/feed?lite=1&limit=2');
    console.log('─'.repeat(60));
    
    const phase1Url = `${API_BASE_URL}/api/feed?lite=1&limit=2`;
    const phase1Response = await fetch(phase1Url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`Status: ${phase1Response.status} ${phase1Response.statusText}`);
    console.log(`Content-Type: ${phase1Response.headers.get('content-type')}`);

    if (!phase1Response.ok) {
      const errorText = await phase1Response.text();
      console.error('❌ Phase-1 request failed:', errorText);
      return;
    }

    const phase1Data = await phase1Response.json();
    console.log('\n✅ Phase-1 Response Structure:');
    console.log(JSON.stringify(phase1Data, null, 2));

    // Validate Phase-1 structure
    console.log('\n🔍 Phase-1 Validation:');
    const phase1Valid = validatePhase1Response(phase1Data);
    if (phase1Valid.valid) {
      console.log('✅ Phase-1 response is valid');
      console.log(`   - Items count: ${phase1Data.items?.length || 0}`);
      if (phase1Data.items && phase1Data.items.length > 0) {
        const firstItem = phase1Data.items[0];
        console.log(`   - First item has 'kind': ${'kind' in firstItem}`);
        console.log(`   - First item has 'actor': ${'actor' in firstItem}`);
        console.log(`   - First item has 'textPreview': ${'textPreview' in firstItem}`);
        console.log(`   - First item kind: ${firstItem.kind}`);
        console.log(`   - First item actor name: ${firstItem.actor?.name || 'N/A'}`);
      }
    } else {
      console.error('❌ Phase-1 response is invalid:', phase1Valid.errors.join(', '));
    }

    // Test Phase-2 (Full) endpoint
    console.log('\n\n📦 Testing Phase-2 (Full) Endpoint: GET /api/feed');
    console.log('─'.repeat(60));
    
    const phase2Url = `${API_BASE_URL}/api/feed`;
    const phase2Response = await fetch(phase2Url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`Status: ${phase2Response.status} ${phase2Response.statusText}`);
    console.log(`Content-Type: ${phase2Response.headers.get('content-type')}`);

    if (!phase2Response.ok) {
      const errorText = await phase2Response.text();
      console.error('❌ Phase-2 request failed:', errorText);
      return;
    }

    const phase2Data = await phase2Response.json();
    console.log('\n✅ Phase-2 Response Structure (first item only):');
    const limitedData = {
      ...phase2Data,
      items: phase2Data.items?.slice(0, 1) || [],
    };
    console.log(JSON.stringify(limitedData, null, 2));

    // Validate Phase-2 structure
    console.log('\n🔍 Phase-2 Validation:');
    const phase2Valid = validatePhase2Response(phase2Data);
    if (phase2Valid.valid) {
      console.log('✅ Phase-2 response is valid');
      console.log(`   - Items count: ${phase2Data.items?.length || 0}`);
      if (phase2Data.items && phase2Data.items.length > 0) {
        const firstItem = phase2Data.items[0];
        console.log(`   - First item has 'type': ${'type' in firstItem}`);
        console.log(`   - First item type: ${firstItem.type}`);
        if (firstItem.type === 'post') {
          console.log(`   - First item has 'post': ${'post' in firstItem}`);
          console.log(`   - Post ID: ${firstItem.post?.id || 'N/A'}`);
        } else if (firstItem.type === 'suggestion') {
          console.log(`   - First item has 'suggestion': ${'suggestion' in firstItem}`);
          console.log(`   - Suggestion userId: ${firstItem.suggestion?.userId || 'N/A'}`);
        }
      }
    } else {
      console.error('❌ Phase-2 response is invalid:', phase2Valid.errors.join(', '));
    }

    console.log('\n\n📊 Summary:');
    console.log(`Phase-1: ${phase1Valid.valid ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`Phase-2: ${phase2Valid.valid ? '✅ Valid' : '❌ Invalid'}`);

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

function validatePhase1Response(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Response is not an object');
    return { valid: false, errors };
  }

  if (!('items' in data)) {
    errors.push("Missing 'items' field");
  } else if (!Array.isArray(data.items)) {
    errors.push("'items' is not an array");
  } else if (data.items.length > 0) {
    const firstItem = data.items[0];
    
    // Phase-1 should have 'kind' and 'actor', not 'type'
    if (!('kind' in firstItem)) {
      errors.push("First item missing 'kind' field (Phase-1 format)");
    }
    if (!('actor' in firstItem)) {
      errors.push("First item missing 'actor' field (Phase-1 format)");
    }
    if ('type' in firstItem) {
      errors.push("First item has 'type' field (should be Phase-2 format, not Phase-1)");
    }
  }

  return { valid: errors.length === 0, errors };
}

function validatePhase2Response(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Response is not an object');
    return { valid: false, errors };
  }

  if (!('items' in data)) {
    errors.push("Missing 'items' field");
  } else if (!Array.isArray(data.items)) {
    errors.push("'items' is not an array");
  } else if (data.items.length > 0) {
    const firstItem = data.items[0];
    
    // Phase-2 should have 'type', not 'kind'
    if (!('type' in firstItem)) {
      errors.push("First item missing 'type' field (Phase-2 format)");
    }
    if ('kind' in firstItem) {
      errors.push("First item has 'kind' field (should be Phase-1 format, not Phase-2)");
    }
    
    const itemType = firstItem.type;
    if (itemType === 'post' && !('post' in firstItem)) {
      errors.push("Item with type 'post' missing 'post' field");
    } else if (itemType === 'suggestion' && !('suggestion' in firstItem)) {
      errors.push("Item with type 'suggestion' missing 'suggestion' field");
    } else if (itemType === 'question' && !('question' in firstItem)) {
      errors.push("Item with type 'question' missing 'question' field");
    }
  }

  return { valid: errors.length === 0, errors };
}

// Run the test
testFeedApi().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
