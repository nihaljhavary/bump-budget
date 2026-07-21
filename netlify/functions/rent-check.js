import './_ws-polyfill.js'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' }
  }

  try {
    if (event.httpMethod === 'GET') {
      return handleGet(event)
    }
    if (event.httpMethod === 'POST') {
      return handlePost(event)
    }
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) }
  } catch (err) {
    console.error('rent-check error:', err)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Something went wrong. Please try again.' }) }
  }
}

async function handleGet(event) {
  const { area, bedrooms } = event.queryStringParameters || {}

  // If no params, return list of all available areas
  if (!area) {
    const { data, error } = await supabase
      .from('rental_benchmarks')
      .select('area, region')
      .order('area')

    if (error) {
      console.error('Failed to fetch areas:', error)
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Could not load areas.' }) }
    }

    // Deduplicate areas, include region
    const seen = new Set()
    const areas = []
    for (const row of data) {
      const key = row.area + '|' + row.region
      if (!seen.has(key)) {
        seen.add(key)
        areas.push({ area: row.area, region: row.region })
      }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ areas }) }
  }

  // Fetch benchmark for specific area + bedrooms
  const beds = parseInt(bedrooms, 10)
  if (isNaN(beds) || beds < 0 || beds > 4) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'bedrooms must be 0-4' }) }
  }

  const { data: benchmark, error: bErr } = await supabase
    .from('rental_benchmarks')
    .select('*')
    .eq('area', area)
    .eq('bedrooms', beds)
    .single()

  if (bErr && bErr.code !== 'PGRST116') {
    console.error('Benchmark fetch error:', bErr)
  }

  // Fetch community submissions for this area + bedrooms (last 12 months)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  const { data: submissions, error: sErr } = await supabase
    .from('rent_submissions')
    .select('monthly_rent')
    .eq('area', area)
    .eq('bedrooms', beds)
    .gte('submitted_at', twelveMonthsAgo.toISOString())

  if (sErr) {
    console.error('Submissions fetch error:', sErr)
  }

  // Compute community stats
  let community = null
  if (submissions && submissions.length >= 3) {
    const rents = submissions.map(s => s.monthly_rent).sort((a, b) => a - b)
    const mid = Math.floor(rents.length / 2)
    const median = rents.length % 2 === 0
      ? Math.round((rents[mid - 1] + rents[mid]) / 2)
      : rents[mid]
    community = {
      median,
      count: rents.length,
      low: rents[Math.floor(rents.length * 0.25)],
      high: rents[Math.floor(rents.length * 0.75)],
    }
  }

  // Also fetch all bedroom options for this area (for the UI to show available options)
  const { data: allBeds } = await supabase
    .from('rental_benchmarks')
    .select('bedrooms')
    .eq('area', area)
    .order('bedrooms')

  const availableBedrooms = allBeds ? allBeds.map(b => b.bedrooms) : []

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      benchmark: benchmark || null,
      community,
      availableBedrooms,
      submissionCount: submissions ? submissions.length : 0,
    }),
  }
}

async function handlePost(event) {
  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { area, bedrooms, monthly_rent } = body

  // Validate
  if (!area || typeof area !== 'string' || area.length < 2 || area.length > 100) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Valid area name required' }) }
  }

  const beds = parseInt(bedrooms, 10)
  if (isNaN(beds) || beds < 0 || beds > 4) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'bedrooms must be 0-4' }) }
  }

  const rent = parseInt(monthly_rent, 10)
  if (isNaN(rent) || rent < 500 || rent > 200000) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Rent must be between R500 and R200,000' }) }
  }

  // Rate limit: hash IP, max 5 submissions per hour
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'
  const ipHash = crypto.createHash('sha256').update(ip + process.env.SUPABASE_SERVICE_ROLE_KEY).digest('hex').slice(0, 16)

  const oneHourAgo = new Date()
  oneHourAgo.setHours(oneHourAgo.getHours() - 1)

  const { count } = await supabase
    .from('rent_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('submitted_at', oneHourAgo.toISOString())

  if (count >= 5) {
    return { statusCode: 429, headers: CORS, body: JSON.stringify({ error: 'Too many submissions. Try again later.' }) }
  }

  // Insert
  const { error } = await supabase
    .from('rent_submissions')
    .insert({
      area,
      bedrooms: beds,
      monthly_rent: rent,
      ip_hash: ipHash,
    })

  if (error) {
    console.error('Insert error:', error)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Could not save. Try again.' }) }
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ success: true, message: 'Thanks for contributing!' }),
  }
}
