import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';

const QuoteCard = () => {
  return (
    <View style={styles.container}>

      {/* Mountain Background */}
      <Image
        source={require('../../../assets/images/mountain.png')}
        style={styles.mountains}
        resizeMode="cover"
      />

      {/* Quote */}
      <View style={styles.quoteContainer}>

        <Text style={styles.quoteMark}>
          “
        </Text>

        <Text style={styles.quote}>
          Discipline today,{'\n'}
          a better tomorrow.
        </Text>

      </View>

    </View>
  );
};

const styles = StyleSheet.create({

  container: {
    marginHorizontal: 20,
    marginTop: 20,
    height: 100,

    borderRadius: 20,
    overflow: 'hidden',

    backgroundColor: '#FFF9EE',

    shadowColor: '#64748B',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,

    elevation: 2,
  },

  mountains: {
    position: 'absolute',

    right: 0,
    bottom: 0,

    width: '55%',
    height: '100%',
  },

  quoteContainer: {
    flex: 1,

    flexDirection: 'row',
    alignItems: 'center',

    paddingLeft: 16,
    paddingRight: 120,
  },

  quoteMark: {
    fontSize: 48,
    fontWeight: '800',

    color: '#101827',

    marginRight: 10,

    marginTop: -10,
  },

  quote: {
    fontSize: 18,
    lineHeight: 28,

    fontWeight: '600',

    color: '#101827',
  },

});

export default QuoteCard;