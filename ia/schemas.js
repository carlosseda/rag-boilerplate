const segmentationSchema = {
  type: 'object',

  properties: {
    join_previous: {
      type: 'boolean'
    },

    joined_title: {
      type: 'string'
    },

    joined_keywords: {
      type: 'array',
      items: {
        type: 'string'
      }
    },

    segments: {
      type: 'array',

      items: {
        type: 'object',

        properties: {
          start_id: {
            type: 'string'
          },

          end_id: {
            type: 'string'
          },

          title: {
            type: 'string'
          },

          category: {
            type: 'string',

            enum: [
              'content',
              'table',
              'metadata',
              'boilerplate',
              'other'
            ]
          },

          keywords: {
            type: 'array',

            items: {
              type: 'string'
            }
          }
        },

        required: [
          'start_id',
          'end_id',
          'title',
          'category',
          'keywords'
        ],

        additionalProperties: false
      }
    }
  },

  required: [
    'join_previous',
    'joined_title',
    'joined_keywords',
    'segments'
  ],

  additionalProperties: false
}

module.exports = { segmentationSchema }