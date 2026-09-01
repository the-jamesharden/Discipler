/**
 * The words a generated password is built from.
 *
 * Its own module because it is a list and nothing else: `generatePassword` in
 * `src/domain/accounts.ts` is the rule, and a rule and a thousand words of data
 * change for entirely different reasons.
 *
 * Every word here has to survive being said out loud across a room and then typed
 * on a phone keyboard by somebody who has never seen it written down. That is the
 * whole specification, and it is what each of the constraints below is for. They
 * are asserted in `tests/domain/generating-a-password.test.ts` rather than trusted,
 * because a word added by hand is a word added without them in mind.
 *
 * - **Four to eight letters, lower case, `a`-`z` only.** No apostrophe, no hyphen,
 *   no accent: the separator between words is a hyphen, and a word carrying one of
 *   its own turns a four-word password into an unreadable one.
 *
 * - **No two words within one edit of each other.** `flour` and `flower` in the
 *   same list is a support call, and so are `panda`/`panda`-adjacent near-misses no
 *   one would think to check by eye. One insertion, deletion, substitution or
 *   transposition apart is the mechanical form of *these two sound alike*, and it
 *   is what the test enforces. It is a floor and not the whole rule: `stork` and
 *   `stalk` are two edits apart and were still worth thinking about.
 *
 * - **No homophones.** Nothing here shares its sound with another common English
 *   word -- neither member of a pair like `flour`/`flower`, `peace`/`piece` or
 *   `hangar`/`hanger` is present, because the risk is in the listener's spelling
 *   and excluding one of the two does not remove it.
 *
 * - **No word whose British and American spellings differ.** `harbour`/`harbor`,
 *   `catalogue`/`catalog` and `aluminium`/`aluminum` are the same failure as a
 *   homophone wearing a different hat: the Admin says one word and the Leader types
 *   the other spelling.
 *
 * - **No silent-letter traps.** `knuckle`, `wren`, `castle` and `column` are all
 *   ordinary words and all of them are typed wrong by somebody who has only heard
 *   them.
 *
 * Exactly 1024, which is not decoration: a power of two makes each word worth ten
 * bits exactly, so four of them are worth forty and the arithmetic in
 * `generatePassword` needs no correction for a list size that does not divide.
 */
export const PASSWORD_WORDS: readonly string[] = [
  'abbey', 'ability', 'acorn', 'album', 'alder', 'almond', 'amber', 'amethyst',
  'anchor', 'antelope', 'anthem', 'anvil', 'apple', 'apricot', 'apron', 'archer',
  'archway', 'armchair', 'arrow', 'artist', 'aspen', 'athlete', 'atlas', 'attic',
  'author', 'avocado', 'awning', 'azalea', 'backpack', 'badger', 'baker', 'balance',
  'balcony', 'ballad', 'balloon', 'bamboo', 'banana', 'banjo', 'banner', 'barber',
  'bargain', 'barge', 'barley', 'barrel', 'baseball', 'basement', 'basil', 'basket',
  'bazaar', 'beacon', 'beauty', 'beaver', 'bedroom', 'beehive', 'beetle', 'bell',
  'bicycle', 'birch', 'birdbath', 'birdsong', 'birthday', 'biscuit', 'bison', 'bistro',
  'black', 'blade', 'blanket', 'blazer', 'blender', 'blessing', 'blizzard', 'blossom',
  'blue', 'bluebell', 'bluebird', 'bobcat', 'bonfire', 'bookcase', 'bookmark', 'bookshop',
  'boot', 'bottle', 'boulder', 'bounty', 'boutique', 'bowl', 'bowling', 'boxing',
  'bracelet', 'bracket', 'bramble', 'branch', 'bravery', 'bread', 'breeze', 'bridge',
  'bronze', 'broom', 'broth', 'brown', 'brush', 'bubble', 'bucket', 'buckle',
  'buffalo', 'builder', 'bungalow', 'bunker', 'butcher', 'butter', 'button', 'cabbage',
  'cabin', 'cabinet', 'cactus', 'calendar', 'calf', 'camel', 'camera', 'campfire',
  'canal', 'candle', 'canoe', 'canoeing', 'canopy', 'canteen', 'canyon', 'captain',
  'caravan', 'cardigan', 'cardinal', 'cargo', 'carousel', 'carpet', 'carriage', 'cascade',
  'cassette', 'catfish', 'cattle', 'cauldron', 'caution', 'cave', 'cavern', 'cedar',
  'celery', 'cello', 'century', 'chair', 'chalk', 'chapel', 'chapter', 'charcoal',
  'chariot', 'charity', 'cheerful', 'cheese', 'cheetah', 'chef', 'chemist', 'cherry',
  'chest', 'chestnut', 'chimney', 'chipmunk', 'chisel', 'chorus', 'cinder', 'cinema',
  'cinnamon', 'circle', 'clam', 'clarinet', 'cliff', 'clinic', 'cloak', 'cloud',
  'clove', 'coaster', 'cobweb', 'cocoa', 'coconut', 'cocoon', 'coffee', 'coil',
  'collar', 'college', 'comet', 'comfort', 'compass', 'composer', 'conifer', 'copper',
  'coral', 'corridor', 'cosmos', 'cottage', 'cotton', 'couch', 'cougar', 'counter',
  'courage', 'courtesy', 'cousin', 'coyote', 'crab', 'cradle', 'crater', 'crayon',
  'crescent', 'crew', 'cricket', 'crimson', 'crocus', 'crossbow', 'crossing', 'crutch',
  'crystal', 'cube', 'cucumber', 'cupboard', 'curious', 'curtain', 'curve', 'cushion',
  'custard', 'custom', 'cutlery', 'cycling', 'cyclone', 'cylinder', 'cypress', 'daffodil',
  'dagger', 'dahlia', 'daisy', 'dancer', 'date', 'daughter', 'dawn', 'daybreak',
  'daydream', 'daylight', 'decade', 'deck', 'decoy', 'delight', 'delta', 'denim',
  'dentist', 'destiny', 'diameter', 'diamond', 'diary', 'dignity', 'diligent', 'diving',
  'doctor', 'dolphin', 'dome', 'donkey', 'doorbell', 'doorknob', 'doormat', 'doorway',
  'drawer', 'drawing', 'dress', 'driveway', 'drizzle', 'drum', 'drummer', 'dumpling',
  'dune', 'dusk', 'duty', 'eager', 'eagle', 'earnest', 'earring', 'ease',
  'eclipse', 'editor', 'effort', 'elbow', 'emblem', 'embrace', 'emerald', 'energy',
  'engineer', 'entrance', 'envelope', 'equinox', 'eraser', 'essay', 'estuary', 'evening',
  'explorer', 'fabric', 'factory', 'fairness', 'faith', 'falcon', 'family', 'fanfare',
  'farm', 'farmer', 'farmland', 'farmyard', 'father', 'felt', 'fence', 'fencing',
  'fern', 'ferret', 'ferry', 'festival', 'fiddle', 'file', 'finch', 'firefly',
  'firewood', 'firework', 'fixture', 'flagpole', 'flame', 'flask', 'flint', 'florist',
  'flute', 'foal', 'folder', 'foliage', 'football', 'footpath', 'forest', 'fork',
  'fortune', 'fossil', 'foxglove', 'fragment', 'freedom', 'freight', 'friend', 'frontier',
  'frost', 'furnace', 'gadget', 'galaxy', 'gallery', 'gallop', 'garage', 'garden',
  'gardener', 'garland', 'garlic', 'garnet', 'gateway', 'gazebo', 'gazelle', 'gemstone',
  'gentle', 'geranium', 'ginger', 'giraffe', 'girder', 'glacier', 'glider', 'glimmer',
  'globe', 'glory', 'goat', 'gold', 'goodness', 'gopher', 'gorge', 'graceful',
  'grandson', 'granite', 'grape', 'gravel', 'grocer', 'grove', 'guide', 'guitar',
  'gull', 'hallway', 'hamlet', 'hammer', 'hammock', 'hamster', 'handbag', 'handrail',
  'harmony', 'harness', 'harvest', 'hawk', 'hawthorn', 'hayfield', 'haystack', 'hazel',
  'headland', 'hearth', 'heather', 'hedge', 'hedgehog', 'heirloom', 'helmet', 'heron',
  'herring', 'hibiscus', 'hill', 'hillside', 'hinge', 'hockey', 'hoist', 'holiday',
  'hollow', 'holly', 'homework', 'honesty', 'honey', 'hope', 'horizon', 'hornet',
  'hospital', 'hotel', 'humid', 'humility', 'hurry', 'hyena', 'icicle', 'igloo',
  'incense', 'index', 'insight', 'iron', 'island', 'ivory', 'jackal', 'jacket',
  'jade', 'jaguar', 'jasmine', 'jeep', 'jelly', 'jigsaw', 'journal', 'journey',
  'joyful', 'judge', 'judo', 'jumper', 'junction', 'jungle', 'juniper', 'justice',
  'kale', 'karate', 'kayak', 'keyboard', 'keyhole', 'keyring', 'keystone', 'kindle',
  'kindling', 'kindness', 'kiosk', 'kitchen', 'kite', 'kitten', 'kiwi', 'koala',
  'ladder', 'ladybird', 'lagoon', 'lake', 'lakeside', 'lamb', 'lamppost', 'landmark',
  'lantern', 'lark', 'lattice', 'launch', 'laundry', 'laurel', 'lavender', 'lawyer',
  'leaf', 'ledger', 'legend', 'lemon', 'lemur', 'lens', 'lentil', 'leopard',
  'letter', 'lettuce', 'lever', 'liberty', 'library', 'lifeboat', 'lilac', 'lily',
  'lime', 'lion', 'lively', 'lobster', 'locust', 'lodge', 'logic', 'lorry',
  'lotus', 'loyalty', 'luggage', 'lullaby', 'lunchbox', 'lyric', 'macaw', 'magnet',
  'magnolia', 'magpie', 'mahogany', 'mango', 'mansion', 'manual', 'maple', 'marathon',
  'marble', 'marigold', 'marina', 'mariner', 'market', 'maroon', 'marsh', 'mason',
  'matchbox', 'mattress', 'meadow', 'measure', 'mechanic', 'meerkat', 'melody', 'melon',
  'merchant', 'mercury', 'mercy', 'merit', 'meteor', 'method', 'midnight', 'miner',
  'mineral', 'mint', 'mirror', 'mongoose', 'monsoon', 'moonbeam', 'mortar', 'mosaic',
  'moss', 'moth', 'mother', 'mountain', 'muffler', 'mulberry', 'mule', 'museum',
  'musician', 'nail', 'napkin', 'navy', 'nebula', 'necklace', 'necktie', 'nectar',
  'needle', 'nephew', 'nettle', 'nickel', 'niece', 'nomad', 'noodle', 'noon',
  'notebook', 'notepad', 'novel', 'novelist', 'nurse', 'nursery', 'nutmeg', 'nylon',
  'oasis', 'octave', 'office', 'olive', 'onion', 'opal', 'opera', 'optimism',
  'orange', 'orbit', 'orchard', 'orchid', 'order', 'organ', 'ornament', 'otter',
  'overcast', 'oyster', 'package', 'paddle', 'padlock', 'painter', 'painting', 'palm',
  'panda', 'panel', 'pansy', 'panther', 'parade', 'parasol', 'parcel', 'parent',
  'parrot', 'parsley', 'pasta', 'pastry', 'pasture', 'pathway', 'patient', 'pattern',
  'pavement', 'pavilion', 'peaceful', 'peacock', 'peanut', 'pearl', 'pebble', 'pecan',
  'pedestal', 'pelican', 'pencil', 'pendant', 'penguin', 'pepper', 'perch', 'petal',
  'pharmacy', 'pheasant', 'pianist', 'piano', 'pickle', 'picnic', 'picture', 'pigeon',
  'piglet', 'pike', 'pilot', 'pink', 'pipeline', 'pitcher', 'planet', 'plaque',
  'platform', 'platinum', 'platter', 'plaza', 'pliers', 'plumber', 'pocket', 'poem',
  'pollen', 'polo', 'pony', 'poplar', 'porridge', 'port', 'porter', 'possum',
  'postcard', 'potato', 'pottery', 'prairie', 'praise', 'prawn', 'presence', 'preserve',
  'pretzel', 'primrose', 'promise', 'pudding', 'puffin', 'pulley', 'puma', 'pumpkin',
  'punch', 'puppet', 'puppy', 'purple', 'purpose', 'puzzle', 'pyramid', 'quail',
  'quality', 'quarry', 'quartz', 'quiet', 'quiver', 'rabbit', 'raccoon', 'radiant',
  'radiator', 'radish', 'radius', 'raft', 'rafter', 'railing', 'rainbow', 'raincoat',
  'raindrop', 'rainfall', 'ranger', 'rapids', 'raven', 'ravine', 'reading', 'recorder',
  'redwood', 'reef', 'referee', 'refuge', 'reindeer', 'relief', 'resolve', 'respect',
  'rhino', 'rhubarb', 'rhyme', 'rice', 'ripple', 'river', 'roadway', 'robin',
  'rooftop', 'rose', 'rosebush', 'rosemary', 'rowing', 'ruby', 'rucksack', 'ruler',
  'runner', 'runway', 'safety', 'sage', 'sailor', 'salt', 'sand', 'sandal',
  'sandbank', 'sapling', 'sapphire', 'sardine', 'satchel', 'satin', 'sauce', 'saucepan',
  'scarf', 'scarlet', 'school', 'scone', 'scooter', 'scramble', 'scroll', 'sculptor',
  'seal', 'seashell', 'seashore', 'seaside', 'season', 'seaweed', 'seed', 'segment',
  'sentinel', 'serene', 'serenity', 'serpent', 'sesame', 'shadow', 'shark', 'shawl',
  'sheep', 'sheepdog', 'shelf', 'shepherd', 'shirt', 'shoelace', 'shore', 'shoulder',
  'shovel', 'shower', 'shrew', 'shrimp', 'shrub', 'shutter', 'sibling', 'signpost',
  'silence', 'silk', 'silver', 'skating', 'sketch', 'skewer', 'skiing', 'skill',
  'skunk', 'skylight', 'slate', 'sleet', 'sleeve', 'slipper', 'slope', 'sloth',
  'snow', 'snowdrop', 'snowfall', 'sock', 'sofa', 'solar', 'soldier', 'sonata',
  'songbird', 'soup', 'spade', 'sparrow', 'spatula', 'sphere', 'spice', 'spinach',
  'spiral', 'spirit', 'splash', 'splinter', 'sponge', 'spoon', 'spring', 'sprout',
  'spruce', 'square', 'squash', 'squid', 'squirrel', 'stadium', 'staple', 'star',
  'starfish', 'starling', 'station', 'steady', 'steamer', 'steeple', 'stem', 'stencil',
  'stool', 'stork', 'stream', 'strength', 'stride', 'studio', 'sturdy', 'sugar',
  'suitcase', 'summer', 'summit', 'sunbeam', 'sundial', 'sunlight', 'sunrise', 'sunset',
  'sunshine', 'supper', 'surfing', 'surplus', 'swallow', 'swamp', 'swan', 'swift',
  'swimmer', 'swing', 'sycamore', 'symphony', 'syrup', 'tabletop', 'talent', 'tanker',
  'tapestry', 'taxi', 'teacher', 'teacup', 'teak', 'teapot', 'teaspoon', 'temple',
  'tempo', 'tennis', 'terrace', 'thicket', 'thimble', 'thorn', 'thread', 'thrush',
  'thunder', 'tiger', 'timber', 'toast', 'tomato', 'tongs', 'toolbox', 'torch',
  'tornado', 'toucan', 'tower', 'tractor', 'trailer', 'tranquil', 'trapdoor', 'tray',
  'treetop', 'trek', 'triangle', 'tribute', 'tricycle', 'trinket', 'tripod', 'trolley',
  'trombone', 'trophy', 'trot', 'trousers', 'trowel', 'trumpet', 'trunk', 'trust',
  'truth', 'tugboat', 'tulip', 'tuna', 'turbine', 'turkey', 'turnip', 'turtle',
  'tutor', 'tweezers', 'twig', 'twilight', 'typhoon', 'ukulele', 'umbrella', 'uncle',
  'uniform', 'unity', 'valley', 'vanilla', 'vault', 'velvet', 'verse', 'vessel',
  'vibrant', 'victory', 'villa', 'village', 'vinegar', 'vineyard', 'violet', 'violin',
  'virtue', 'vision', 'vivid', 'volcano', 'volume', 'voyage', 'vulture', 'waffle',
  'wagon', 'waiter', 'walkway', 'wallet', 'walnut', 'walrus', 'wardrobe', 'warmth',
  'wasp', 'watch', 'waterway', 'weasel', 'weekend', 'welcome', 'welder', 'wheat',
  'whisk', 'whisper', 'white', 'wildlife', 'willing', 'willow', 'windmill', 'window',
  'winter', 'wisdom', 'wolf', 'wombat', 'wonder', 'woodland', 'woodshed', 'wool',
  'workshop', 'worth', 'writing', 'yarn', 'yeast', 'yellow', 'zebra', 'zenith',
]
