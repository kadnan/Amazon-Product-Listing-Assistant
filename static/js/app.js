$(function () {
    const $studio = $('#listing-studio')
    const searchUrl = $studio.attr('data-search-url')
    const compareUrl = $studio.attr('data-compare-url')
    const modal = bootstrap.Modal.getOrCreateInstance($('#competitor-modal')[0])
    const currencies = {
        'amazon.com': 'USD',
        'amazon.co.uk': 'GBP',
        'amazon.ca': 'CAD'
    }

    let products = []
    const selected = new Set()
    let searchRequest = null
    let comparisonRequest = null
    let searchVersion = 0
    let inputVersion = 0
    let hasResults = false
    let busy = false
    let lastSearch = null

    function showMessage(selector, text) {
        $(selector).text(text).toggleClass('d-none', !text)
    }

    function updateButtons() {
        $('#find-products').prop('disabled', busy || !!searchRequest)
        $('#change-products').prop('disabled', busy || !products.length)

        $('#compare-button').prop(
            'disabled',
            busy || !!searchRequest || !selected.size
        )

        $('#regenerate').prop(
            'disabled',
            busy || !!searchRequest || !hasResults || !selected.size
        )

        $('#copy').prop('disabled', busy || !hasResults)
        $('.competitor input').prop('disabled', busy)
    }

    function markResultsStale() {
        inputVersion += 1
        $('#results-stale').toggleClass('d-none', !hasResults)
        $('#status').text('')
        updateButtons()
    }

    // API/LLM text is inserted with .text()/.val(), not interpreted as HTML.
    function safeUrl(value) {
        try {
            const url = new URL(value)
            return ['https:', 'http:'].includes(url.protocol) ? url.href : null
        } catch {
            return null
        }
    }

    function appendSource($parent, url, label) {
        const href = safeUrl(url)
        if (!href) return

        $('<a>', {
            class: 'source d-inline-block me-2',
            href,
            target: '_blank',
            rel: 'noopener noreferrer'
        })
            .text(label || 'View source ↗')
            .appendTo($parent)
    }

    function productRow(product, prefix) {
        const id = `${prefix}-${product.asin}`
        const $row = $('<div>', {class: 'competitor'})

        $('<input>', {
            class: 'form-check-input m-0',
            type: 'checkbox',
            id,
            value: product.asin
        })
            .prop('checked', selected.has(product.asin))
            .attr('aria-label', `Compare with ${product.title}`)
            .appendTo($row)

        const imageUrl = safeUrl(product.image)

        if (imageUrl) {
            $('<img>', {
                src: imageUrl,
                alt: '',
                width: 38,
                height: 46,
                loading: 'lazy',
                class: 'flex-shrink-0'
            })
                .css('object-fit', 'contain')
                .appendTo($row)
        }

        const $info = $('<div>').appendTo($row)

        $('<label>', {
            class: 'competitor-title',
            for: id
        })
            .text(product.title)
            .appendTo($info)

        if (product.price != null) {
            $('<div>', {class: 'small text-secondary'})
                .text(
                    `${product.currency || currencies[lastSearch.marketplace]} ${product.price}`
                )
                .appendTo($info)
        }

        if (product.rating != null) {
            const $rating = $('<div>', {class: 'rating'}).appendTo($info)
            const rating = Number(product.rating)

            if (Number.isFinite(rating) && rating >= 0 && rating <= 5) {
                $('<span>', {
                    class: 'stars',
                    'aria-hidden': 'true'
                })
                    .text(
                        '★'.repeat(Math.round(rating)) +
                        '☆'.repeat(5 - Math.round(rating))
                    )
                    .appendTo($rating)

                $rating.append(
                    $('<span>').text(
                        ` ${rating}/5${
                            product.reviews != null
                                ? ` · ${product.reviews} reviews`
                                : ''
                        }`
                    )
                )
            }
        }

        // Build sources from returned ASIN + search marketplace.
        appendSource(
            $info,
            `https://www.${lastSearch.marketplace}/dp/${product.asin}`
        )

        return $row
    }

    function renderProducts() {
        $('#modal-products, #selected-products').empty()

        products.forEach(product => {
            $('#modal-products').append(productRow(product, 'modal'))

            if (selected.has(product.asin)) {
                $('#selected-products').append(productRow(product, 'selected'))
            }
        })

        $('#products-empty').toggleClass('d-none', selected.size > 0)
        $('#selection-count').text(`${selected.size} selected`)
        updateButtons()
    }

    function errorMessage(xhr, fallback) {
        if (xhr.status === 404) {
            return 'This action is not connected yet. The Flask endpoint still needs to be implemented.'
        }

        const message = xhr.responseJSON && xhr.responseJSON.error
        return typeof message === 'string' ? message : fallback
    }

    function cancelSearch() {
        searchVersion += 1

        const pending = searchRequest
        searchRequest = null

        if (pending) pending.abort()

        $('#search-loading').addClass('d-none')
    }

    function searchProducts() {
        const query = $('#search-term').val().trim()

        if (!query) {
            $('#search-term')[0].reportValidity()
            $('#product-status').text('Enter a search term first.')
            return
        }

        cancelSearch()

        const version = searchVersion
        const marketplace = $('#marketplace').val()

        products = []
        selected.clear()
        lastSearch = {query, marketplace}

        renderProducts()
        markResultsStale()

        $('#product-status').text('')
        $('#search-context').text(
            `Results for “${query}” · ${$('#marketplace option:selected').text()}`
        )

        showMessage('#search-error', '')
        $('#search-empty').addClass('d-none')
        $('#search-loading').removeClass('d-none')

        modal.show()

        searchRequest = $.ajax({
            url: searchUrl,
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({query, marketplace}),
            timeout: 60000
        })

        updateButtons()

        searchRequest.done(response => {
            if (version !== searchVersion) return

            if (!response || !Array.isArray(response.products)) {
                showMessage(
                    '#search-error',
                    'The product search returned an unexpected response.'
                )
                return
            }

            const seen = new Set()

            products = response.products.filter(product => {
                if (
                    !product ||
                    !/^[A-Z0-9]{10}$/.test(product.asin) ||
                    typeof product.title !== 'string' ||
                    seen.has(product.asin)
                ) {
                    return false
                }

                seen.add(product.asin)
                return true
            })

            renderProducts()
            $('#search-empty').toggleClass('d-none', products.length > 0)
        }).fail((xhr, reason) => {
            if (version !== searchVersion || reason === 'abort') return

            showMessage(
                '#search-error',
                errorMessage(xhr, 'Unable to load products. Please try again.')
            )
        }).always(() => {
            if (version !== searchVersion) return

            searchRequest = null
            $('#search-loading').addClass('d-none')
            updateButtons()
        })
    }

    function renderInsights(competitors) {
    const $insights = $('#insights').empty()

    competitors.forEach(product => {
        const $section = $('<div>', {
            class: 'insight'
        }).appendTo($insights)

        $('<h3>')
            .text(product.title)
            .appendTo($section)

        if (product.price != null && product.currency) {
            $('<p>', {
                class: 'small text-secondary mb-2'
            })
                .text(`${product.currency} ${product.price}`)
                .appendTo($section)
        }

       const $list = $('<ul>', {
            class: 'ps-3 mb-2'
        }).appendTo($section)

        product.summary.forEach(bullet => {
    $('<li>', {
        class: 'mb-1'
    })
        .text(bullet)
        .appendTo($list)
})

        appendSource($section, product.url, 'View listing ↗')
    })

    $('#comparison-count').text(competitors.length)
    $('#comparison-empty').addClass('d-none')
    $('#comparison-summary, #insights').removeClass('d-none')
}

function validResult(response) {
    return response &&
        Array.isArray(response.competitors) &&
        response.competitors.every(item =>
            item &&
            typeof item.asin === 'string' &&
            typeof item.title === 'string' &&
            Array.isArray(item.summary) &&
            item.summary.length > 0 &&
            item.summary.every(bullet =>
                typeof bullet === 'string' && !!bullet.trim()
            )
        ) &&
        response.draft &&
        typeof response.draft.title === 'string' &&
        !!response.draft.title.trim() &&
        typeof response.draft.description === 'string' &&
        !!response.draft.description.trim()
}

    let draftInputVersion = null

function compareAndWrite(regenerate = false) {
    if (busy || searchRequest) return
    if (!$('#product-form')[0].reportValidity()) return

    if (!selected.size) {
        $('#product-status').text('Select at least one competitor first.')
        return
    }

    if (regenerate && draftInputVersion !== inputVersion) {
        $('#product-status').text('Your inputs changed. Click Compare & write first.')
        return
    }

    const requestData = {
        marketplace: $('#marketplace').val(),
        product: {
            name: $('#product-name').val().trim(),
            price: Number($('#price').val()),
            details: $('#details').val().trim()
        },
        competitor_asins: Array.from(selected),
        regenerate
    }

    if (!requestData.product.name || !requestData.product.details) {
        $('#product-status').text('Enter a product name and details.')
        return
    }

    if (regenerate) {
        requestData.previous_draft = {
            title: $('#draft-title').val().trim(),
            description: $('#draft-description').val().trim()
        }
    } else {
        draftInputVersion = null

        $('#insights').empty().addClass('d-none')
        $('#comparison-summary, #comparison-empty, #results-stale')
            .addClass('d-none')
        $('#comparison-count').text('0')
    }

    const version = inputVersion

    busy = true
    updateButtons()

    $('#product-form input, #product-form textarea, #product-form select')
        .prop('disabled', true)

    $('#draft-loading').removeClass('d-none')

    if (!regenerate) {
        $('#comparison-loading').removeClass('d-none')
    }

    showMessage('#comparison-error', '')
    $('#product-status, #status').text('')

    comparisonRequest = $.ajax({
        url: compareUrl,
        method: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(requestData),
        timeout: 300000
    })

    comparisonRequest.done(response => {
        if (version !== inputVersion) return

        const draft = response && response.draft
        const validDraft = draft &&
            typeof draft.title === 'string' &&
            !!draft.title.trim() &&
            typeof draft.description === 'string' &&
            !!draft.description.trim()

        if (!validDraft || (!regenerate && !validResult(response))) {
            showMessage(
                '#comparison-error',
                'The model returned an unexpected response. Please try again.'
            )
            return
        }

        if (!regenerate) {
            renderInsights(response.competitors)
        }

        $('#draft-title').val(draft.title)
        $('#draft-description').val(draft.description)
        $('#draft-empty, #results-stale').addClass('d-none')
        $('#draft-content').removeClass('d-none')

        hasResults = true
        draftInputVersion = version

        $('#status').text(
            regenerate ? 'New draft ready.' : 'Summaries and draft ready.'
        )
    }).fail((xhr, reason, error) => {
        console.log('Listing generation failed', {
            status: xhr.status,
            reason,
            error,
            response: xhr.responseText
        })

        showMessage(
            '#comparison-error',
            reason === 'timeout'
                ? 'Request timed out. Please try again.'
                : errorMessage(
                    xhr,
                    'Unable to generate your draft. Please try again.'
                )
        )
    }).always(() => {
        comparisonRequest = null
        busy = false

        $('#comparison-loading, #draft-loading').addClass('d-none')

        $('#product-form input, #product-form textarea, #product-form select')
            .prop('disabled', false)

        updateButtons()
    })
}

    $('#find-products').on('click', searchProducts)

    $('#change-products').on('click', () => modal.show())

    $('#search-term').on('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault()
            if (!busy) searchProducts()
        }
    })

    $(document).on('change', '.competitor input', function () {
        $(this).prop('checked')
            ? selected.add($(this).val())
            : selected.delete($(this).val())

        renderProducts()
        markResultsStale()
    })

    $('#product-form').on(
        'input',
        'input:not([type="checkbox"]), textarea',
        markResultsStale
    )

    $('#search-term').on('input', () => {
        cancelSearch()

        products = []
        selected.clear()
        lastSearch = null

        renderProducts()

        $('#search-context').text(
            'Search term changed. Click Find to load new products.'
        )

        showMessage('#search-error', '')
        $('#search-empty').addClass('d-none')
    })

    $('#marketplace').on('change', () => {
        $('label[for="price"]').text(
            `Price (${currencies[$('#marketplace').val()]})`
        )

        cancelSearch()

        products = []
        selected.clear()
        lastSearch = null

        renderProducts()

        $('#search-context').text(
            'Marketplace changed. Click Find to load new products.'
        )

        showMessage('#search-error', '')
        $('#search-empty').addClass('d-none')

        markResultsStale()
    })

    $('#product-form').on('submit', event => {
        event.preventDefault()
        compareAndWrite()
    })

    // Regenerate refreshes the comparison and draft using the same endpoint.
    $('#regenerate').on('click', () => compareAndWrite(true))

    $('#copy').on('click', async () => {
        if (!hasResults) return

        const text = `${$('#draft-title').val()}\n\n${$('#draft-description').val()}`

        try {
            await navigator.clipboard.writeText(text)
            $('#status').text('Draft copied.')
        } catch {
            const $copyArea = $('<textarea>')
                .val(text)
                .css({position: 'fixed', opacity: 0})
                .appendTo('body')

            $copyArea.trigger('select')

            const copied = document.execCommand('copy')
            $copyArea.remove()

            $('#status').text(
                copied
                    ? 'Draft copied.'
                    : 'Select and copy the draft text manually.'
            )
        }
    })

    renderProducts()

    $('#regenerate').on('click', function (event) {
        event.preventDefault()
        compareAndWrite(true)
    })
})