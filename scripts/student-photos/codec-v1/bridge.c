#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "webp/decode.h"
#include "webp/encode.h"

#define CAPACITY (128u * 1024u)
static uint8_t input[CAPACITY];
static uint8_t output[CAPACITY];
static size_t output_size;
static int result_width, result_height;
typedef struct { size_t limit; int exceeded; } OutputBudget;
static void wipe(uint8_t* value, size_t length) {
  volatile uint8_t* cursor = value;
  while (length-- != 0) *cursor++ = 0;
}
void photo_clear(void) {
  wipe(input, sizeof(input)); wipe(output, sizeof(output));
  output_size = 0; result_width = result_height = 0;
}
uint8_t* photo_input_ptr(void) { return input; }
uint8_t* photo_output_ptr(void) { return output; }
size_t photo_output_size(void) { return output_size; }
int photo_width(void) { return result_width; }
int photo_height(void) { return result_height; }
int photo_decoder_version(void) { return WebPGetDecoderVersion(); }
int photo_encoder_version(void) { return WebPGetEncoderVersion(); }
static int write_bounded(const uint8_t* data, size_t size, const WebPPicture* picture) {
  OutputBudget* budget = (OutputBudget*)picture->custom_ptr;
  if (size > budget->limit - output_size) { budget->exceeded = 1; return 0; }
  memcpy(output + output_size, data, size); output_size += size; return 1;
}
/* Decode every pixel, including for adoption of a canonical file that must not
 * be recompressed. No resize, alpha, animation or automatic quality retry. */
static int decode_bounded(size_t length, int variant, uint8_t** result, size_t* pixels_size) {
  if ((variant != 0 && variant != 1) || length < 20 || length > (variant == 0 ? CAPACITY : CAPACITY / 2)) return 1;
  WebPBitstreamFeatures features;
  if (WebPGetFeatures(input, length, &features) != VP8_STATUS_OK || features.has_animation) return 3;
  const int width = features.width, height = features.height;
  if (width <= 0 || height <= 0 || (variant == 0
      ? (width > 900 || height > 1200 || width * 4 != height * 3)
      : (width > 320 || height > 320 || width != height))) return 2;
  if (features.has_alpha) return 4;
  *pixels_size = (size_t)width * (size_t)height * 4;
  uint8_t* pixels = (uint8_t*)malloc(*pixels_size);
  if (pixels == NULL) return 7;
  if (WebPDecodeRGBAInto(input, length, pixels, *pixels_size, width * 4) == NULL) {
    wipe(pixels, *pixels_size); free(pixels); return 3;
  }
  for (size_t i = 3; i < *pixels_size; i += 4) {
    if (pixels[i] != 255) { wipe(pixels, *pixels_size); free(pixels); return 4; }
  }
  result_width=width; result_height=height; *result=pixels; return 0;
}
int photo_validate(size_t length, int variant) {
  result_width=result_height=0;
  uint8_t* pixels=NULL; size_t size=0;
  const int status=decode_bounded(length,variant,&pixels,&size);
  if (pixels != NULL) { wipe(pixels,size); free(pixels); }
  return status;
}
/* Status: 1=input, 2=dimensions, 3=decode, 4=alpha, 5=encode,
 * 6=output budget, 7=allocation/ABI. */
int photo_normalize(size_t length, int variant, int quality) {
  output_size = 0; result_width = result_height = 0; wipe(output, sizeof(output));
  if (quality != 92 && quality != 86 && quality != 80) return 1;
  uint8_t* pixels=NULL; size_t pixels_size=0;
  const int status=decode_bounded(length,variant,&pixels,&pixels_size);
  if (status != 0) return status;
  WebPConfig config; WebPPicture picture;
  if (!WebPConfigPreset(&config, WEBP_PRESET_PHOTO, (float)quality) || !WebPPictureInit(&picture)) {
    wipe(pixels, pixels_size); free(pixels); return 7;
  }
  config.method = 4; config.thread_level = 0; config.target_size = 0; config.target_PSNR = 0;
  picture.width = result_width; picture.height = result_height;
  OutputBudget budget = { variant == 0 ? CAPACITY : CAPACITY / 2, 0 };
  picture.writer = write_bounded; picture.custom_ptr = &budget;
  const int imported = WebPPictureImportRGBA(&picture, pixels, result_width * 4);
  wipe(pixels, pixels_size); free(pixels);
  const int encoded = imported && WebPValidateConfig(&config) && WebPEncode(&config, &picture);
  WebPPictureFree(&picture);
  if (!encoded) { output_size = 0; wipe(output, sizeof(output)); return budget.exceeded ? 6 : 5; }
  return 0;
}
